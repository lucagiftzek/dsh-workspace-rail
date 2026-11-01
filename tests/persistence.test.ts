// SPDX-License-Identifier: Apache-2.0
// Rail state sync over the rail's own API. History: (1) state read from the
// settings scope before it loaded wiped saved data on every page load;
// (2) settings are memory-only for any non-loopback browser, so projects made
// through a public host name never reached the host and vanished.
import { describe, expect, it } from 'vitest'
import { createRailSync, mergeRailStates, type FetchLike } from '../src/sync.ts'
import { normalizeRailState, EMPTY_RAIL_STATE, type RailState } from '../src/store.ts'

const empty = (): RailState => normalizeRailState(EMPTY_RAIL_STATE)
const withProject = (id: string, name: string): RailState => ({
  ...empty(), projectOrder: [id], projects: { [id]: { id, name, hueKey: 'teal', workspaceId: null, autoCarryover: false } },
})

function fakeHost(initial: { rev: number; state: unknown }) {
  const host = { ...initial }
  const calls: Array<{ method: string; body?: { baseRev?: number; state?: RailState } }> = []
  const fetch: FetchLike = async (_url, init) => {
    const method = init?.method ?? 'GET'
    if (method === 'GET') { calls.push({ method }); return { ok: true, status: 200, json: async () => ({ rev: host.rev, state: host.state }) } }
    const body = JSON.parse(String(init?.body)) as { baseRev?: number; state?: RailState }
    calls.push({ method, body })
    if (body.baseRev !== host.rev) return { ok: false, status: 409, json: async () => ({ rev: host.rev, state: host.state }) }
    host.rev += 1; host.state = body.state
    return { ok: true, status: 200, json: async () => ({ rev: host.rev }) }
  }
  return { host, calls, fetch }
}
const tick = (ms = 20): Promise<void> => new Promise(r => setTimeout(r, ms))

describe('rail sync', () => {
  it('writes nothing before the host copy has loaded', async () => {
    const h = fakeHost({ rev: 3, state: withProject('p1', 'Saved') })
    const sync = createRailSync({ fetch: h.fetch, adopt: () => {}, debounceMs: 1 })
    sync.save(empty())
    await tick()
    expect(h.calls.filter(c => c.method === 'PUT')).toHaveLength(0)
  })

  it('hydrate keeps the host copy and recovers a project stranded in this browser', async () => {
    const h = fakeHost({ rev: 3, state: withProject('p1', 'Saved') })
    const sync = createRailSync({ fetch: h.fetch, adopt: () => {}, debounceMs: 1 })
    const local = withProject('p2', 'Only in this browser')
    local.memberships = { s9: 'p2' }
    const merged = await sync.hydrate(local)
    expect(Object.keys(merged!.projects).sort()).toEqual(['p1', 'p2'])
    expect(merged!.memberships.s9).toBe('p2')
    expect((h.host.state as RailState).projects.p2?.name).toBe('Only in this browser') // pushed up
  })

  it('a stale tab adopts the host copy on 409 instead of clobbering it', async () => {
    const h = fakeHost({ rev: 1, state: withProject('p1', 'A') })
    let adopted: RailState | null = null
    const sync = createRailSync({ fetch: h.fetch, adopt: s => { adopted = s }, debounceMs: 1 })
    await sync.hydrate(empty())
    h.host.rev = 7; h.host.state = withProject('p1', 'Renamed elsewhere')
    sync.save(withProject('p1', 'Mine'))
    await tick()
    expect(adopted!.projects.p1!.name).toBe('Renamed elsewhere')
    expect((h.host.state as RailState).projects.p1!.name).toBe('Renamed elsewhere')
  })

  it('debounces bursts of edits into one write', async () => {
    const h = fakeHost({ rev: 1, state: empty() })
    const sync = createRailSync({ fetch: h.fetch, adopt: () => {}, debounceMs: 10 })
    await sync.hydrate(empty())
    for (let i = 0; i < 5; i++) sync.save(withProject('p', 'n' + i))
    await tick(60)
    const puts = h.calls.filter(c => c.method === 'PUT')
    expect(puts).toHaveLength(1)
    expect(puts[0]!.body!.state!.projects.p!.name).toBe('n4')
  })

  it('merge drops memberships that point at a project that exists nowhere', () => {
    const local = empty(); local.memberships = { s1: 'ghost' }
    expect(mergeRailStates(empty(), local).merged.memberships).toEqual({})
  })
})
