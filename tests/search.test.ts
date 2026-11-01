// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { buildSearchDocs } from '../src/search-docs.ts'
import { rankResults } from '../src/scoring.ts'
import { EMPTY_RAIL_STATE, normalizeRailState, type RailState } from '../src/store.ts'
import type { CatalogEntry } from '../src/catalog.ts'

const entries: CatalogEntry[] = [
  { id: 'a', title: 'HPC grant plan', workspaceId: null, blank: false },
  { id: 'b', title: 'Grocery list', workspaceId: null, blank: false },
  { id: 'c', title: 'Mapping MCP review', workspaceId: null, blank: false },
]

const state = (): RailState => {
  let s = normalizeRailState(EMPTY_RAIL_STATE)
  s = { ...s, ...(() => s)() }
  s.projects['p1'] = { id: 'p1', name: 'Acme Ops', hueKey: 'teal', workspaceId: null, autoCarryover: false }
  s.projectOrder = ['p1']
  s.folders['f1'] = { id: 'f1', name: 'AI Infra', iconKind: 'pixel', iconValue: 'folder', iconTone: 'black', parentId: null, collapsed: false }
  s.folderOrder = ['f1']
  s.memberships['a'] = 'p1'
  s.docs['d1'] = { id: 'd1', projectId: 'p1', kind: 'document', name: 'margin-analysis.md', pointer: '~/docs/m.md' }
  s.sessionFolders['c'] = 'f1'
  s.pinned = ['a']
  return s
}

describe('buildSearchDocs + rankResults (end-to-end tiers)', () => {
  const windows = {
    b: { f: ['what is the hpc grant plan for this quarter'], l: ['summary: nothing pending'] },
  }

  it('tier 1 via title, boosted by pin', () => {
    const docs = buildSearchDocs(entries, state(), {})
    const hits = rankResults(docs, 'hpc grant plan', 1_000_000)
    expect(hits[0].id).toBe('a')
    expect(hits[0].tier).toBe(1)
  })

  it('tier 2 via project doc names (member chats only)', () => {
    const docs = buildSearchDocs(entries, state(), {})
    const hits = rankResults(docs, 'margin-analysis', 1_000_000)
    expect(hits.map(h => h.id)).toEqual(['a'])
    expect(hits[0].tier).toBe(2)
  })

  it('tier 3 via first messages of another session', () => {
    const docs = buildSearchDocs(entries, state(), windows)
    const hits = rankResults(docs, 'this quarter', 1_000_000)
    expect(hits[0].id).toBe('b')
    expect(hits[0].tier).toBe(3)
  })

  it('folder names surface their member chats at tier 1', () => {
    const docs = buildSearchDocs(entries, state(), {})
    const hits = rankResults(docs, 'AI Infra', 1_000_000)
    expect(hits.map(h => h.id)).toEqual(['c'])
  })

  it('pinned/project chats carry the boost flag', () => {
    const docs = buildSearchDocs(entries, state(), {})
    expect(docs.find(d => d.id === 'a')?.pinned).toBe(true)
    expect(docs.find(d => d.id === 'c')?.pinned).toBe(true)
    expect(docs.find(d => d.id === 'b')?.pinned).toBe(false)
  })
})