// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { moveFolder, movePinnedSession, reorderIds } from '../src/folders.ts'
import { EMPTY_RAIL_STATE, normalizeRailState, type RailState } from '../src/store.ts'

const mk = (over: Partial<RailState>): RailState => normalizeRailState({ ...EMPTY_RAIL_STATE, ...over })
const folder = (id: string, parentId: string | null = null) => ({ id, name: id, iconKind: 'pixel' as const, iconValue: 'folder', iconTone: 'black' as const, parentId, collapsed: false })

describe('movePinnedSession', () => {
  const state = mk({
    pinned: ['a', 'b', 'c', 'x', 'y'],
    folders: { F: folder('F'), G: folder('G') },
    folderOrder: ['F', 'G'],
    sessionFolders: { x: 'F', y: 'F' },
  })
  it('reorders standalone chats', () => {
    expect(movePinnedSession(state, 'c', { kind: 'session', id: 'a', after: false }).pinned).toEqual(['c', 'a', 'b', 'x', 'y'])
    expect(movePinnedSession(state, 'a', { kind: 'session', id: 'c', after: true }).pinned).toEqual(['b', 'c', 'a', 'x', 'y'])
  })
  it('reorders inside a folder', () => {
    expect(Object.keys(movePinnedSession(state, 'y', { kind: 'session', id: 'x', after: false }).sessionFolders)).toEqual(['y', 'x'])
  })
  it('moves into a folder (appended) and out again', () => {
    const inn = movePinnedSession(state, 'a', { kind: 'folder', id: 'G' })
    expect(inn.sessionFolders).toEqual({ x: 'F', y: 'F', a: 'G' })
    const near = movePinnedSession(state, 'a', { kind: 'session', id: 'x', after: true })
    expect(Object.entries(near.sessionFolders)).toEqual([['x', 'F'], ['a', 'F'], ['y', 'F']])
    const out = movePinnedSession(state, 'x', { kind: 'session', id: 'b', after: false })
    expect(out.sessionFolders).toEqual({ y: 'F' })
    expect(out.pinned.indexOf('x')).toBe(out.pinned.indexOf('b') - 1)
  })
  it('end drop makes it standalone last', () => {
    const r = movePinnedSession(state, 'x', { kind: 'end' })
    expect(r.pinned[r.pinned.length - 1]).toBe('x')
    expect(r.sessionFolders).toEqual({ y: 'F' })
  })
  it('ignores self drops', () => {
    expect(movePinnedSession(state, 'a', { kind: 'session', id: 'a', after: true }).pinned).toEqual(state.pinned)
  })
})

describe('moveFolder / reorderIds', () => {
  const state = mk({ folders: { F: folder('F'), G: folder('G'), H: folder('H'), S: folder('S', 'F') }, folderOrder: ['F', 'G', 'H', 'S'] })
  it('reorders sibling folders only', () => {
    expect(moveFolder(state, 'H', 'F', false)).toEqual(['H', 'F', 'G', 'S'])
    expect(moveFolder(state, 'F', 'H', true)).toEqual(['G', 'H', 'F', 'S'])
    expect(moveFolder(state, 'S', 'G', false)).toEqual(state.folderOrder)
  })
  it('reorders id lists', () => {
    expect(reorderIds(['a', 'b', 'c'], 'c', 'a', false)).toEqual(['c', 'a', 'b'])
    expect(reorderIds(['a', 'b', 'c'], 'a', 'c', true)).toEqual(['b', 'c', 'a'])
    expect(reorderIds(['a', 'b'], 'a', 'zz', true)).toEqual(['a', 'b'])
  })
})
