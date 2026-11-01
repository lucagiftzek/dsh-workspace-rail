// SPDX-License-Identifier: Apache-2.0
// Host half on both DSH lines, against fake hosts:
// - DSH 0.1.5: ctx.settings.register exists (registered namespace, seed, window bridge).
// - DSH 0.2.x: ctx.settings is SettingsForms (describe/update/replace/mutate/configure,
//   no register/get); the rail must not touch it and must serve state.json alone.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdirSync, mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, Config, settingsMode } from '../src/index.ts'
import { API_PREFIX } from '../src/host/api.ts'

// homedir() follows $HOME: every rail path (state.json, transcripts) lands in a scratch home.
const realHome = process.env.HOME
const home = mkdtempSync(join(tmpdir(), 'rail-dual-host-'))
process.env.HOME = home
afterAll(() => { process.env.HOME = realHome; rmSync(home, { recursive: true, force: true }) })

const stateFile = join(home, '.dsh', 'workspace-rail', 'state.json')
const defaults = (over: Record<string, unknown> = {}) => ({ ...(Config as unknown as (v: object) => object)({}), ...over }) as never

type Handler = (req: unknown, res: unknown) => unknown

function fakeCtx(settings: unknown) {
  const routes: Array<{ kind: string; path: string; handler: Handler }> = []
  const intervals: Array<() => void> = []
  const info = vi.fn()
  const ctx = {
    settings,
    webServer: { register: (r: { kind: string; path: string; handler: Handler }) => { routes.push(r); return () => {} } },
    effect(fn: () => () => void) { fn() },
    setInterval(fn: () => void) { intervals.push(fn) },
    logger: { info, warn: vi.fn() },
  }
  return { ctx, routes, intervals, info }
}

async function serve(handler: Handler): Promise<{ base: string; close(): void }> {
  const server: Server = createServer((req, res) => { void handler(req, res) })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()))
  const port = (server.address() as { port: number }).port
  return { base: `http://127.0.0.1:${port}${API_PREFIX}`, close: () => server.close() }
}

/** A minimal 0.1.5 settings scope over one in-memory document. */
function fakeRegister(doc: Record<string, unknown>) {
  const scope = { get: vi.fn(() => doc), update: vi.fn(async (patch: Record<string, unknown>) => { Object.assign(doc, patch) }) }
  const register = vi.fn(() => scope)
  return { settings: { register, get: vi.fn() }, scope, register }
}

/** The 0.2.x SettingsForms face: every method is a spy that must stay unused. */
function fakeForms() {
  return {
    describe: vi.fn(() => []), update: vi.fn(), replace: vi.fn(), mutate: vi.fn(), configure: vi.fn(),
    writable: true, documentPath: vi.fn(), prepareDocument: vi.fn(),
  }
}

let quiet: Array<ReturnType<typeof vi.spyOn>> = []
beforeEach(() => {
  rmSync(join(home, '.dsh'), { recursive: true, force: true })
  // registerProjectSearch reports on the console when no tools service is reachable.
  quiet = [vi.spyOn(console, 'log').mockImplementation(() => {}), vi.spyOn(console, 'error').mockImplementation(() => {})]
})
afterEach(() => { for (const s of quiet) s.mockRestore() })

describe('settingsMode', () => {
  it('detects each line by capability', () => {
    expect(settingsMode({ settings: { register() {} } } as never)).toBe('register')
    expect(settingsMode({ settings: fakeForms() } as never)).toBe('forms')
    expect(settingsMode({ settings: undefined } as never)).toBe('none')
    const throwing = { get settings(): never { throw new Error('cannot get property "settings" without inject') } }
    expect(settingsMode(throwing as never)).toBe('none')
  })
})

describe('Config', () => {
  it('declares no volatile field, so the 0.2.x core refuses to import the stale settings.yaml section', () => {
    const dict = (Config as unknown as { dict: Record<string, { meta?: { volatile?: boolean } }> }).dict
    expect(Object.keys(dict).length).toBeGreaterThan(0)
    for (const [key, field] of Object.entries(dict)) expect([key, field.meta?.volatile === true]).toEqual([key, false])
  })
})

describe('host on DSH 0.1.5 (register)', () => {
  it('registers the namespace with the original base, mounts the API and the bridge', () => {
    const { settings, register } = fakeRegister({})
    const { ctx, routes, intervals, info } = fakeCtx(settings)
    apply(ctx as never, defaults())
    expect(register).toHaveBeenCalledTimes(1)
    const [ns, , options] = register.mock.calls[0] as unknown as [string, unknown, { base: Record<string, unknown>; applies: string }]
    expect(ns).toBe('workspace-rail')
    expect(options.applies).toBe('live')
    expect(options.base).toMatchObject({ enableRail: true, stripeEdge: 'right', recentsMaxRows: 5000, indexRequests: [], windows: {}, journal: [], docHealth: {}, repairRequests: [] })
    expect(routes.map(r => [r.kind, r.path])).toEqual([['prefix', API_PREFIX]])
    // enablePointerHealth defaults on: the bridge timer is armed, as before.
    expect(intervals).toHaveLength(1)
    expect(info).toHaveBeenCalledWith('workspace-rail: armed - settings namespace registered, window/pointer bridge on')
  })

  it('seeds a missing state.json from the namespace (persisted keys only)', async () => {
    const { settings } = fakeRegister({ pinned: ['s1'], projects: { p: { id: 'p', name: 'P' } }, indexRequests: ['x'], windows: { x: { f: [], l: [] } } })
    const { ctx, routes } = fakeCtx(settings)
    apply(ctx as never, defaults())
    const srv = await serve(routes[0]!.handler)
    try {
      const body = await (await fetch(srv.base + '/state')).json() as { rev: number; state: Record<string, unknown> }
      expect(body.state).toEqual({ pinned: ['s1'], projects: { p: { id: 'p', name: 'P' } } })
      expect(JSON.parse(readFileSync(stateFile, 'utf8')).state.pinned).toEqual(['s1'])
    } finally { srv.close() }
  })

  it('window bridge: drains indexRequests into windows when the index is on', async () => {
    const doc: Record<string, unknown> = { indexRequests: ['missing-a', 'missing-b'], windows: {} }
    const { settings, scope } = fakeRegister(doc)
    const { ctx, intervals } = fakeCtx(settings)
    apply(ctx as never, defaults({ enableWindowsIndex: true }))
    intervals[0]!()
    await Promise.resolve()
    expect(scope.update).toHaveBeenCalledWith({ windows: {}, indexRequests: [] })
  })

  it('pointer bridge: answers repairRequests through docHealth', async () => {
    const doc: Record<string, unknown> = { repairRequests: ['p1'], docs: { d1: { id: 'd1', projectId: 'p1', pointer: join(home, 'nope.txt') } }, docHealth: {} }
    const { settings, scope } = fakeRegister(doc)
    const { ctx, intervals } = fakeCtx(settings)
    apply(ctx as never, defaults())
    intervals[0]!()
    await Promise.resolve()
    expect(scope.update).toHaveBeenCalledWith({ docHealth: { d1: expect.objectContaining({ status: 'missing' }) }, repairRequests: [] })
  })
})

describe('host on DSH 0.2.x (forms)', () => {
  it('never calls the forms service, mounts the API, arms no bridge', () => {
    const forms = fakeForms()
    const { ctx, routes, intervals, info } = fakeCtx(forms)
    apply(ctx as never, defaults({ enableWindowsIndex: true }))
    for (const fn of [forms.describe, forms.update, forms.replace, forms.mutate, forms.configure]) expect(fn).not.toHaveBeenCalled()
    expect(routes.map(r => [r.kind, r.path])).toEqual([['prefix', API_PREFIX]])
    expect(intervals).toHaveLength(0)
    expect(info).not.toHaveBeenCalled()
    const logged = (quiet[0]!.mock.calls as unknown[][]).map(c => String(c[0]))
    expect(logged.some(l => l.includes('armed - state.json store') && l.includes('settings mode: forms') && l.includes('enableWindowsIndex needs'))).toBe(true)
  })

  it('serves the existing state.json unchanged and never seeds one', async () => {
    const { ctx, routes } = fakeCtx(fakeForms())
    apply(ctx as never, defaults())
    const srv = await serve(routes[0]!.handler)
    try {
      // No state.json yet: nothing to seed from, nothing written.
      const empty = await (await fetch(srv.base + '/state')).json() as { rev: number; state: unknown }
      expect(empty).toEqual({ rev: 1, state: null })
      expect(existsSync(stateFile)).toBe(false)
    } finally { srv.close() }

    // A real store (as carried over from 0.1.5) is served exactly as stored.
    const stored = { rev: 118, state: { schemaVersion: 1, pinned: ['a'], importedSessionPinAt: 1790508887828, binned: { z: 1 } } }
    mkdirSync(join(home, '.dsh', 'workspace-rail'), { recursive: true })
    writeFileSync(stateFile, JSON.stringify(stored))
    const second = fakeCtx(fakeForms())
    apply(second.ctx as never, defaults())
    const srv2 = await serve(second.routes[0]!.handler)
    try {
      expect(await (await fetch(srv2.base + '/state')).json()).toEqual(stored)
    } finally { srv2.close() }
  })
})
