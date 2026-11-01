// @vitest-environment jsdom
// SPDX-License-Identifier: Apache-2.0
// Browser half on both DSH lines, against a fake cordis context whose
// ctx.inject behaves like cordis 4: the callback runs (after a microtask) only
// when every named service exists.
// - DSH 0.1.5: settingsScope exists (window bridge + pin import over the bound namespaces).
// - DSH 0.2.x: no settingsScope; the pin import reads entry 'session-pin' through
//   remote.settings.describe(), and nothing waits for a service that never comes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client.ts'
import { pinsFromDescribe, readNativePins, readPinsFromRemote, readPinsFromScope, readPinsWithoutScope, SESSION_PIN_LOCAL_KEY } from '../src/pin-import.ts'

const RAIL_KEY = 'dsh.workspace-rail.state'

/** Services DSH 0.2.1-rc.5's web client provides that the rail names (read from the core). */
const SERVICES_ON_021 = new Set(['sessions', 'workspaces', 'slots', 'uiWorkspace', 'remote', 'remote.settings', 'remote.session', 'configForms'])

function fakeSessions() {
  const snap = {
    phase: 'ready', current: 's1', ids: ['s1', 's2', 's3'],
    byId: {
      s1: { displayTitle: 'One', blank: false, updatedAt: 1 },
      s2: { displayTitle: 'Two', blank: false, updatedAt: 2 },
      s3: { displayTitle: 'Blank', blank: true },
    },
  }
  return { list: { getSnapshot: () => snap, subscribe: () => () => {} } }
}
/** The workspaces list; `pinned` adds the 0.2.x native pin set (absent on 0.1.5). */
function fakeWorkspaces(pinned?: string[]) {
  const snap = { phase: 'ready', items: [], archivedSessionIds: [], ...(pinned !== undefined ? { pinnedSessionIds: pinned } : {}) }
  return { list: { getSnapshot: () => snap, subscribe: () => () => {} } }
}

/** A cordis-like context: required services as properties, optional ones through inject(). */
function fakeCtx(optional: Record<string, unknown>, nativePins?: string[]) {
  const injected: string[][] = []
  const disposers: Array<() => void> = []
  const ctx = {
    sessions: fakeSessions(),
    workspaces: fakeWorkspaces(nativePins),
    logger: { warn: vi.fn() },
    inject(deps: string[], cb: (sub: Record<string, unknown>) => void) {
      injected.push(deps)
      if (!deps.every(d => d in optional)) return
      const sub: Record<string, unknown> = { effect: (fn: () => () => void) => { disposers.push(fn()) } }
      for (const d of deps) {
        const [head, tail] = d.split('.')
        if (tail === undefined) sub[head!] = optional[d]
      }
      queueMicrotask(() => cb(sub))
    },
  }
  return { ctx, injected, disposers }
}

/** The rail API: GET /state answers `state`, PUT accepts. */
function fakeFetch(state: unknown) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = []
  const fn = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body !== undefined ? JSON.parse(init.body) : undefined })
    const body = (init?.method ?? 'GET') === 'GET' ? { rev: 1, state } : { rev: 2 }
    return { ok: true, status: 200, json: async () => body }
  })
  return { fn, calls }
}

const stored = (): { pinned: string[]; stripes: Record<string, string>; importedSessionPinAt: number | null } => JSON.parse(localStorage.getItem(RAIL_KEY) ?? 'null')
const freshHostState = { schemaVersion: 1, pinned: [], stripes: {}, importedSessionPinAt: null }

let dispose: (() => void) | null = null
beforeEach(() => { localStorage.clear(); document.body.replaceChildren() })
afterEach(() => { dispose?.(); dispose = null; vi.unstubAllGlobals() })

describe('client inject contract', () => {
  it('requires only services both lines provide (no settingsScope)', () => {
    expect(inject).toEqual(['sessions', 'workspaces', 'slots'])
    for (const name of inject) expect(SERVICES_ON_021.has(name)).toBe(true)
  })

  it('asks for settingsScope and remote.settings only as optional sub-plugins', () => {
    vi.stubGlobal('fetch', fakeFetch({ ...freshHostState, importedSessionPinAt: 1 }).fn)
    const { ctx, injected } = fakeCtx({})
    dispose = apply(ctx as never)
    expect(injected).toContainEqual(['settingsScope'])
    expect(injected).toContainEqual(['remote', 'remote.settings'])
  })
})

describe('client on DSH 0.1.5 (settingsScope)', () => {
  it('imports pins from the bound session-pin namespace and queues windows on the rail namespace', async () => {
    vi.stubGlobal('fetch', fakeFetch(freshHostState).fn)
    const railScope = { getSnapshot: () => ({ status: 'ready', value: { windows: {} } }), set: vi.fn() }
    const pinScope = { getSnapshot: () => ({ status: 'ready', value: { pinned: ['a', 'b', 7], colors: { a: 'red', b: 3 } } }) }
    const settingsScope = { bind: vi.fn(({ namespace }: { namespace: string }) => (namespace === 'session-pin' ? pinScope : railScope)) }
    const describe = vi.fn()
    // remote.settings is present on 0.1.5 too; with a settingsScope it must stay unused.
    const { ctx } = fakeCtx({ settingsScope, remote: { settings: { describe } }, 'remote.settings': true })
    dispose = apply(ctx as never)
    await vi.waitFor(() => expect(typeof stored()?.importedSessionPinAt).toBe('number'))
    expect(stored().pinned).toEqual(['a', 'b'])
    expect(stored().stripes).toEqual({ a: 'red' })
    expect(describe).not.toHaveBeenCalled()
    expect(settingsScope.bind).toHaveBeenCalledWith({ namespace: 'workspace-rail' })
    // Non-blank catalog rows without windows are queued once the scope is bound
    // (in Recents order: newest activity first, s2 updatedAt 2 before s1 updatedAt 1).
    expect(railScope.set).toHaveBeenCalledWith('indexRequests', ['s2', 's1'])
  })

  it('leaves an already-imported host state alone', async () => {
    const f = fakeFetch({ ...freshHostState, pinned: ['keep'], importedSessionPinAt: 5 })
    vi.stubGlobal('fetch', f.fn)
    const settingsScope = { bind: vi.fn(() => ({ getSnapshot: () => ({ value: { pinned: ['other'] } }), set: vi.fn() })) }
    const { ctx } = fakeCtx({ settingsScope })
    dispose = apply(ctx as never)
    await vi.waitFor(() => expect(f.calls.length).toBeGreaterThan(0))
    await new Promise(r => setTimeout(r, 20))
    expect(settingsScope.bind).not.toHaveBeenCalledWith({ namespace: 'session-pin' })
    expect(f.calls.filter(c => c.method === 'PUT')).toHaveLength(0)
  })
})

describe('client on DSH 0.2.x (no settingsScope)', () => {
  it('imports the host\'s native pin set first and does not ask for session-pin', async () => {
    vi.stubGlobal('fetch', fakeFetch(freshHostState).fn)
    const describe = vi.fn(async () => ({ ok: true, value: { namespaces: [{ ns: 'session-pin', value: { pinned: ['old'] } }] } }))
    const { ctx } = fakeCtx({ remote: { settings: { describe } }, 'remote.settings': true }, ['n2', 'n1'])
    dispose = apply(ctx as never)
    await vi.waitFor(() => expect(typeof stored()?.importedSessionPinAt).toBe('number'))
    expect(stored().pinned).toEqual(['n2', 'n1'])
    expect(describe).not.toHaveBeenCalled()
  })

  it('consults a still-installed session-pin only when the native set is empty', async () => {
    vi.stubGlobal('fetch', fakeFetch(freshHostState).fn)
    const describe = vi.fn(async () => ({ ok: true, value: { namespaces: [{ ns: 'session-pin', value: { pinned: ['sp'], colors: { sp: 'red' } } }] } }))
    const { ctx } = fakeCtx({ remote: { settings: { describe } }, 'remote.settings': true }, [])
    dispose = apply(ctx as never)
    await vi.waitFor(() => expect(typeof stored()?.importedSessionPinAt).toBe('number'))
    expect(stored().pinned).toEqual(['sp'])
    expect(stored().stripes).toEqual({ sp: 'red' })
  })

  it('imports pins from entry session-pin through remote.settings.describe', async () => {
    vi.stubGlobal('fetch', fakeFetch(freshHostState).fn)
    const describe = vi.fn(async () => ({ ok: true, value: { namespaces: [
      { ns: 'workspace-rail-unrelated', value: { pinned: ['x'] } },
      { ns: 'session-pin', revision: 3, value: { pinned: ['c'], colors: { c: 'blue' }, workspaceColors: { w: 'green' } } },
    ] } }))
    const { ctx } = fakeCtx({ remote: { settings: { describe } }, 'remote.settings': true })
    dispose = apply(ctx as never)
    await vi.waitFor(() => expect(typeof stored()?.importedSessionPinAt).toBe('number'))
    expect(describe).toHaveBeenCalledTimes(1)
    expect(stored().pinned).toEqual(['c'])
    expect(stored().stripes).toEqual({ c: 'blue' })
  })

  it('falls back to session-pin\'s local copy when the host has no session-pin entry', async () => {
    vi.stubGlobal('fetch', fakeFetch(freshHostState).fn)
    localStorage.setItem(SESSION_PIN_LOCAL_KEY, JSON.stringify({ pinned: ['l1'], colors: { l1: 'amber' } }))
    const describe = vi.fn(async () => ({ ok: true, value: { namespaces: [] } }))
    const { ctx } = fakeCtx({ remote: { settings: { describe } }, 'remote.settings': true })
    dispose = apply(ctx as never)
    await vi.waitFor(() => expect(typeof stored()?.importedSessionPinAt).toBe('number'))
    expect(stored().pinned).toEqual(['l1'])
  })

  it('runs with neither settingsScope nor remote.settings (import marks done, no window requests)', async () => {
    vi.stubGlobal('fetch', fakeFetch(freshHostState).fn)
    const { ctx } = fakeCtx({})
    dispose = apply(ctx as never)
    await vi.waitFor(() => expect(typeof stored()?.importedSessionPinAt).toBe('number'))
    expect(stored().pinned).toEqual([])
    expect(document.querySelector('.__dsh-workspace-rail__')).not.toBeNull()
  })
})

describe('pin readers', () => {
  it('readPinsFromScope keeps the original order: bound namespace, then local copy', () => {
    localStorage.setItem(SESSION_PIN_LOCAL_KEY, JSON.stringify({ pinned: ['local'] }))
    expect(readPinsFromScope({ bind: () => ({ getSnapshot: () => ({ value: { pinned: ['host'] } }) }) as never }, localStorage).pinned).toEqual(['host'])
    expect(readPinsFromScope({ bind: () => ({ getSnapshot: () => ({ status: 'idle', value: undefined }) }) as never }, localStorage).pinned).toEqual(['local'])
    expect(readPinsFromScope(undefined, undefined)).toEqual({ pinned: [], colors: {} })
  })

  it('pinsFromDescribe ignores malformed answers', () => {
    expect(pinsFromDescribe(undefined)).toBeUndefined()
    expect(pinsFromDescribe({ namespaces: 'nope' })).toBeUndefined()
    expect(pinsFromDescribe({ namespaces: [null, { ns: 'session-pin', value: null }] })).toBeUndefined()
    expect(pinsFromDescribe({ namespaces: [{ ns: 'session-pin', value: { pinned: ['p', 1], colors: null } }] })).toEqual({ pinned: ['p'], colors: {} })
  })

  it('readPinsFromRemote retries a failing describe, then falls back to the local copy', async () => {
    const warn = vi.fn()
    const sleep = vi.fn(async () => {})
    const describe = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: { code: 'BUSY' } })
      .mockRejectedValueOnce(new Error('socket closed'))
      .mockResolvedValueOnce({ ok: false, error: { code: 'BUSY' } })
    localStorage.setItem(SESSION_PIN_LOCAL_KEY, JSON.stringify({ pinned: ['l'] }))
    const pins = await readPinsFromRemote({ describe }, localStorage, { tries: 3, sleep, warn })
    expect(describe).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(pins.pinned).toEqual(['l'])
  })

  it('readNativePins: null without a native set, waits for ready, gives up after the timeout', async () => {
    expect(await readNativePins(undefined)).toBeNull()
    expect(await readNativePins({ getSnapshot: () => ({ phase: 'ready' }), subscribe: () => () => {} })).toBeNull()
    let snap: { phase: string; pinnedSessionIds: unknown[] } = { phase: 'pending', pinnedSessionIds: [] }
    const listeners = new Set<() => void>()
    const list = { getSnapshot: () => snap, subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l) } }
    const pending = readNativePins(list, 1000)
    snap = { phase: 'ready', pinnedSessionIds: ['a', 1, 'b'] }
    for (const l of listeners) l()
    expect(await pending).toEqual(['a', 'b'])
    expect(listeners.size).toBe(0)
    expect(await readNativePins({ getSnapshot: () => ({ phase: 'pending', pinnedSessionIds: [] }), subscribe: () => () => {} }, 10)).toBeNull()
  })

  it('readPinsWithoutScope prefers the native set over session-pin', async () => {
    const describe = vi.fn()
    const list = { getSnapshot: () => ({ phase: 'ready', pinnedSessionIds: ['n'] }), subscribe: () => () => {} }
    expect(await readPinsWithoutScope(list, { describe }, undefined)).toEqual({ pinned: ['n'], colors: {} })
    expect(describe).not.toHaveBeenCalled()
  })

  it('readPinsFromRemote succeeds after a transient failure', async () => {
    const describe = vi.fn()
      .mockRejectedValueOnce(new Error('queued'))
      .mockResolvedValueOnce({ ok: true, value: { namespaces: [{ ns: 'session-pin', value: { pinned: ['r'], colors: { r: 'teal' } } }] } })
    const pins = await readPinsFromRemote({ describe }, undefined, { sleep: async () => {} })
    expect(pins).toEqual({ pinned: ['r'], colors: { r: 'teal' } })
  })
})
