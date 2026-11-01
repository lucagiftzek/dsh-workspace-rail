// @vitest-environment jsdom
// SPDX-License-Identifier: Apache-2.0
// Live Recents (2.2): newest completed turn first, driven by the running flag
// the host pushes; redraws only when something shown changed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { catalogSignature, createActivityTracker, orderByActivity, type ActivityRow } from '../src/recents-order.ts'
import { apply } from '../src/client.ts'

describe('activity tracker', () => {
  it('a running -> idle edge stamps a completion that outranks every prompt time', () => {
    let t = 10_000
    const tr = createActivityTracker({ now: () => t })
    const rows: ActivityRow[] = [{ id: 'a', running: false, updatedAt: 9_000 }, { id: 'b', running: true, updatedAt: 5_000 }]
    expect(tr.observe(rows)).toBe(false)
    expect(tr.keyOf(rows[0]!)).toBe(9_000)
    expect(tr.keyOf(rows[1]!)).toBe(5_000)
    t = 20_000
    rows[1] = { id: 'b', running: false, updatedAt: 5_000 }
    expect(tr.observe(rows)).toBe(true)
    expect(tr.keyOf(rows[1]!)).toBe(20_000)
    expect(orderByActivity(rows, r => tr.keyOf(r)).map(r => r.id)).toEqual(['b', 'a'])
  })

  it('a chat keeps its place while its turn runs and moves when the turn completes', () => {
    let t = 1_000
    const tr = createActivityTracker({ now: () => t })
    const a = { id: 'a', running: false, updatedAt: 500 }
    const b = { id: 'b', running: false, updatedAt: 800 }
    tr.observe([a, b])
    // a is prompted (the host bumps updatedAt) and starts working: it stays below b.
    t = 2_000
    const aRun = { id: 'a', running: true, updatedAt: 1_900 }
    tr.observe([aRun, b])
    expect(tr.keyOf(aRun)).toBe(500)
    expect(orderByActivity([aRun, b], r => tr.keyOf(r)).map(r => r.id)).toEqual(['b', 'a'])
    // ...and goes to the top the moment it completes.
    t = 3_000
    const aDone = { id: 'a', running: false, updatedAt: 1_900 }
    tr.observe([aDone, b])
    expect(tr.keyOf(aDone)).toBe(3_000)
    expect(orderByActivity([aDone, b], r => tr.keyOf(r)).map(r => r.id)).toEqual(['a', 'b'])
  })

  it('a chat already running at load holds its place when a follow-up prompt lands mid-turn', () => {
    let t = 1_000
    const tr = createActivityTracker({ now: () => t })
    tr.observe([{ id: 'a', running: true, updatedAt: 400 }, { id: 'b', running: false, updatedAt: 600 }])
    const bumped = { id: 'a', running: true, updatedAt: 900 }
    tr.observe([bumped])
    expect(tr.keyOf(bumped)).toBe(400)
    t = 2_000
    tr.observe([{ id: 'a', running: false, updatedAt: 900 }])
    expect(tr.keyOf({ id: 'a', running: false, updatedAt: 900 })).toBe(2_000)
  })

  it('stamps persist (capped, newest kept) and are loaded back', () => {
    let saved: Record<string, number> = {}
    let t = 100
    const tr = createActivityTracker({ now: () => t, cap: 2, save: s => { saved = s } })
    for (const id of ['x', 'y', 'z']) {
      tr.observe([{ id, running: true }]); t += 10
      tr.observe([{ id, running: false }]); t += 10
    }
    expect(Object.keys(saved).sort()).toEqual(['y', 'z'])
    const again = createActivityTracker({ load: () => saved })
    expect(again.completedAt('z')).toBe(saved.z)
    expect(again.keyOf({ id: 'z', running: false, updatedAt: 1 })).toBe(saved.z)
  })

  it('ordering is stable on ties (host order kept)', () => {
    expect(orderByActivity(['p', 'q', 'r'], () => 5)).toEqual(['p', 'q', 'r'])
  })
})

describe('no-op when unchanged', () => {
  const cat = [{ id: 'a', title: 'A', blank: false, updatedAt: 120_000 }, { id: 'b', title: 'B', blank: false, updatedAt: 60_000 }]
  it('same order, titles and minute: same signature', () => {
    const s1 = catalogSignature(cat, null, 0, new Set())
    expect(catalogSignature(cat.map(e => ({ ...e, updatedAt: e.updatedAt + 1_000 })), null, 0, new Set())).toBe(s1)
  })
  it('a reorder, a rename or a working flag changes it', () => {
    const s1 = catalogSignature(cat, null, 0, new Set())
    expect(catalogSignature([cat[1]!, cat[0]!], null, 0, new Set())).not.toBe(s1)
    expect(catalogSignature([{ ...cat[0]!, title: 'A2' }, cat[1]!], null, 0, new Set())).not.toBe(s1)
    expect(catalogSignature(cat, null, 0, new Set(['b']))).not.toBe(s1)
  })
})

describe('client: Recents reorders live without a reload', () => {
  type Row = { displayTitle: string; blank: boolean; running?: boolean; updatedAt: number }
  let dispose: (() => void) | null = null
  beforeEach(() => { localStorage.clear(); document.body.replaceChildren() })
  afterEach(() => { dispose?.(); dispose = null; vi.unstubAllGlobals(); vi.useRealTimers() })

  it('the chat that completes a turn moves to the top; unrelated updates do not redraw', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ rev: 1, state: { schemaVersion: 1, importedSessionPinAt: 1 } }) })))
    const byId: Record<string, Row> = {
      s1: { displayTitle: 'One', blank: false, updatedAt: 3_000 },
      s2: { displayTitle: 'Two', blank: false, updatedAt: 2_000 },
      s3: { displayTitle: 'Three', blank: false, running: true, updatedAt: 1_000 },
    }
    let snap = { phase: 'ready', ids: ['s1', 's2', 's3'], byId: { ...byId } }
    const subs = new Set<() => void>()
    const push = (): void => { for (const s of [...subs]) s() }
    const ctx = {
      sessions: { list: { getSnapshot: () => snap, subscribe: (fn: () => void) => { subs.add(fn); return () => subs.delete(fn) } } },
      workspaces: { list: { getSnapshot: () => ({ phase: 'ready', items: [], archivedSessionIds: [] }), subscribe: () => () => {} } },
      logger: { warn: vi.fn() },
      inject: () => {},
    }
    dispose = apply(ctx as never)
    await new Promise(r => setTimeout(r, 0))
    const order = (): string[] => [...document.querySelectorAll('.wr-recents .wr-row .wr-title')].map(e => e.textContent ?? '')
    expect(order()).toEqual(['One', 'Two', 'Three'])

    // A streamed token: the host list object changes, nothing shown does -> no redraw.
    const before = document.querySelector('.wr-recents .wr-row')
    snap = { ...snap, byId: { ...snap.byId, s3: { ...byId.s3! } } }
    push()
    expect(document.querySelector('.wr-recents .wr-row')).toBe(before)

    // s3 completes its turn (running -> false): it goes to the top, host order unchanged.
    snap = { ...snap, byId: { ...snap.byId, s3: { ...byId.s3!, running: false } } }
    push()
    expect(order()).toEqual(['Three', 'One', 'Two'])
  })
})
