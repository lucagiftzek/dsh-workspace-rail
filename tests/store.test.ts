// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { createMemoryPersistence, createRailStore, normalizeRailState } from '../src/store.ts'

describe('createRailStore', () => {
  it('persists updates through the persistence face and notifies', () => {
    const mem = createMemoryPersistence()
    const store = createRailStore(mem)
    let notified = 0
    const off = store.subscribe(() => { notified++ })
    store.update(d => { d.projects['p1'] = { id: 'p1', name: 'Acme Ops', hueKey: 'teal', workspaceId: null, autoCarryover: false }; d.projectOrder.push('p1') })
    off()
    store.update(d => { d.stripeEdge = 'left' })
    expect(notified).toBe(1)
    expect(mem.load()?.projects['p1']?.name).toBe('Acme Ops')
    expect(mem.load()?.stripeEdge).toBe('left')
  })

  it('reloads persisted state on construction', () => {
    const mem = createMemoryPersistence()
    const first = createRailStore(mem)
    first.update(d => { d.folders['f1'] = { id: 'f1', name: 'AI Infra', iconKind: 'pixel', iconValue: 'folder', iconTone: 'black', parentId: null, collapsed: false } })
    const second = createRailStore(mem)
    expect(second.getSnapshot().folderOrder).toEqual([])
    expect(second.getSnapshot().folders['f1']?.name).toBe('AI Infra')
  })
})

describe('normalizeRailState', () => {
  it('repairs garbage into a valid state without throwing', () => {
    const s = normalizeRailState({ folders: { f1: { id: 'f1', name: 'X' }, bad: null }, projects: { p1: { id: 'p1', name: 'P' } }, folderOrder: ['f1', 'ghost'], memberships: { a: 'p1', b: 'ghost' }, stripeEdge: 'diagonal', schemaVersion: 99 })
    expect(s.folders['f1']?.iconKind).toBe('pixel')
    expect(s.folders['bad']).toBeUndefined()
    expect(s.folderOrder).toEqual(['f1'])
    expect(s.memberships).toEqual({ a: 'p1' })
    expect(s.stripeEdge).toBe('right')
    expect(s.schemaVersion).toBe(1)
  })

  it('handles null and undefined inputs', () => {
    expect(normalizeRailState(null).projectOrder).toEqual([])
    expect(normalizeRailState(undefined).memberships).toEqual({})
  })
})