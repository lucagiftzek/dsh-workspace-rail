// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { buildRecents, diffCatalog, type CatalogEntry } from '../src/catalog.ts'

const e = (id: string, title = id, blank = false): CatalogEntry => ({ id, title, workspaceId: null, blank })

describe('diffCatalog', () => {
  it('detects additions, removals, and changes by id', () => {
    const prev = [e('a', 'Alpha'), e('b', 'Beta')]
    const next = [e('c', 'Gamma'), e('b', 'Beta renamed'), e('a', 'Alpha')]
    const d = diffCatalog(prev, next)
    expect(d.added.map(x => x.id)).toEqual(['c'])
    expect(d.changed.map(x => x.id)).toEqual(['b'])
    expect(d.removed.map(x => x.id)).toEqual([])
  })

  it('reports removals and preserves host order in the next snapshot', () => {
    const prev = [e('a'), e('b'), e('z')]
    const d = diffCatalog(prev, [e('b'), e('a')])
    expect(d.removed.map(x => x.id)).toEqual(['z'])
    expect(d.added).toHaveLength(0)
  })

  it('treats workspace or blank flips as changes', () => {
    const prev: CatalogEntry[] = [{ id: 'a', title: 'A', workspaceId: null, blank: false }]
    const d = diffCatalog(prev, [{ id: 'a', title: 'A', workspaceId: 'ws1', blank: false }])
    expect(d.changed).toHaveLength(1)
  })
})

describe('buildRecents', () => {
  const projects = { p1: { hueKey: 'teal' }, p2: { hueKey: 'amber' } }
  it('annotates pinned repeats with the pinned kind and keeps order', () => {
    const rows = buildRecents([e('a'), e('b'), e('c')], {
      pinnedIds: ['c'], memberships: {}, projects: {}, stripes: {},
    })
    expect(rows.map(r => r.id)).toEqual(['a', 'b', 'c'])
    expect(rows[2].repeat).toBe('pinned')
    expect(rows[0].repeat).toBe('none')
  })

  it('annotates project repeats with the project hue; explicit stripes win', () => {
    const rows = buildRecents([e('a'), e('b')], {
      pinnedIds: [], memberships: { a: 'p1' }, projects, stripes: { a: 'rose' },
    })
    expect(rows[0].repeat).toBe('project')
    expect(rows[0].hueKey).toBe('rose')
    expect(rows[1].repeat).toBe('none')
    expect(rows[1].hueKey).toBeUndefined()
  })

  it('drops blank sessions by default and includes them on opt-in', () => {
    const rowsOut = buildRecents([e('a', 'A', true), e('b')], { pinnedIds: [], memberships: {}, projects: {}, stripes: {} })
    expect(rowsOut.map(r => r.id)).toEqual(['b'])
    const rowsIn = buildRecents([e('a', 'A', true), e('b')], { pinnedIds: [], memberships: {}, projects: {}, stripes: {}, includeBlank: true })
    expect(rowsIn).toHaveLength(2)
  })

  it('pinned wins over project when both apply', () => {
    const rows = buildRecents([e('a')], { pinnedIds: ['a'], memberships: { a: 'p2' }, projects, stripes: {} })
    expect(rows[0].repeat).toBe('pinned')
  })
})
