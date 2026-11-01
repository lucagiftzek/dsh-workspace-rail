// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { assignSessionFolder, buildPinnedRows, createFolder, deleteFolder, toggleFolderCollapsed, unpinSession } from '../src/folders.ts'
import { EMPTY_RAIL_STATE, normalizeRailState, type RailState } from '../src/store.ts'

const base = (): RailState => normalizeRailState(EMPTY_RAIL_STATE)

describe('createFolder', () => {
  it('creates root folders and one-level children', () => {
    let s = base()
    s = { ...s, ...createFolder(s, { name: 'AI Infra', iconKind: 'pixel', iconValue: 'folder', iconTone: 'black' }) }
    const rootId = s.folderOrder[0]
    s = { ...s, ...createFolder(s, { name: 'Archive Q3', iconKind: 'emoji', iconValue: '\ud83d\udce6', parentId: rootId }) }
    expect(s.folderOrder).toHaveLength(2)
    expect(s.folders[s.folderOrder[1]].parentId).toBe(rootId)
  })

  it('rejects nesting beyond one level and empty names', () => {
    let s = base()
    s = { ...s, ...createFolder(s, { name: 'Root', iconKind: 'pixel', iconValue: 'folder' }) }
    const rootId = s.folderOrder[0]
    s = { ...s, ...createFolder(s, { name: 'Child', iconKind: 'pixel', iconValue: 'folder', parentId: rootId }) }
    const childId = s.folderOrder[1]
    expect(() => createFolder(s, { name: 'Grandchild', iconKind: 'pixel', iconValue: 'folder', parentId: childId })).toThrow()
    expect(() => createFolder(s, { name: '  ', iconKind: 'pixel', iconValue: 'folder' })).toThrow()
  })
})

describe('buildPinnedRows', () => {
  it('orders folders first, then standalone pins, with collapse honored', () => {
    let s = base()
    s = { ...s, pinned: ['s1', 's2'] }
    s = { ...s, ...createFolder(s, { name: 'F', iconKind: 'pixel', iconValue: 'folder' }) }
    const fid = s.folderOrder[0]
    s = { ...s, ...assignSessionFolder(s, 's1', fid) }
    let rows = buildPinnedRows(s, id => 'T-' + id)
    expect(rows.map(r => r.kind + ':' + r.name)).toEqual(['folder:F', 'session:T-s1', 'session:T-s2'])
    expect(rows[1].indent).toBe(1)
    expect(rows[2].indent).toBe(0)
    s = { ...s, ...toggleFolderCollapsed(s, fid) }
    rows = buildPinnedRows(s, id => 'T-' + id)
    expect(rows.map(r => r.kind + ':' + r.name)).toEqual(['folder:F', 'session:T-s2'])
  })

  it('folder members count as pinned in Recents via sessionFolders', () => {
    let s = base()
    s = { ...s, ...createFolder(s, { name: 'F', iconKind: 'pixel', iconValue: 'folder' }) }
    const fid = s.folderOrder[0]
    s = { ...s, ...assignSessionFolder(s, 's1', fid) }
    expect(s.pinned).toContain('s1')
    expect(s.sessionFolders['s1']).toBe(fid)
  })
})

describe('unpin / delete', () => {
  it('unpin removes both the pin list entry and folder membership', () => {
    let s = base()
    s = { ...s, pinned: ['s1'] }
    s = { ...s, ...createFolder(s, { name: 'F', iconKind: 'pixel', iconValue: 'folder' }) }
    const fid = s.folderOrder[0]
    s = { ...s, ...assignSessionFolder(s, 's2', fid) }
    s = { ...s, ...unpinSession(s, 's1') }
    s = { ...s, ...unpinSession(s, 's2') }
    expect(s.pinned).toEqual([])
    expect(s.sessionFolders).toEqual({})
  })

  it('deleting a folder keeps its chats pinned and promotes child folders', () => {
    let s = base()
    s = { ...s, ...createFolder(s, { name: 'Root', iconKind: 'pixel', iconValue: 'folder' }) }
    const rootId = s.folderOrder[0]
    s = { ...s, ...createFolder(s, { name: 'Child', iconKind: 'pixel', iconValue: 'folder', parentId: rootId }) }
    const childId = s.folderOrder[1]
    s = { ...s, ...assignSessionFolder(s, 's1', rootId) }
    s = { ...s, ...deleteFolder(s, rootId) }
    expect(s.folders[rootId]).toBeUndefined()
    expect(s.folders[childId].parentId).toBeNull()
    expect(s.pinned).toContain('s1')
    expect(s.sessionFolders['s1']).toBeUndefined()
  })
})
