// @vitest-environment jsdom
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { collectUnread, computeTabTitle, createSeenTracker, TAB_FRAMES } from '../src/tab-title.ts'
import { RailPanel } from '../src/rail-ui.ts'
import { createMemoryPersistence, createRailStore, normalizeRailState, EMPTY_RAIL_STATE, type RailState } from '../src/store.ts'
import { buildRecents, type CatalogEntry } from '../src/catalog.ts'

describe('title: unread while the open chat works', () => {
  const unread = [{ id: 'a', completedAt: 5, text: 'Some reply text here', title: 'A' }, { id: 'b', completedAt: 9, text: 'Newest', title: 'B' }]
  it('"(N) " + the kitty frames, animated', () => {
    const titles = [0, 1, 2, 3, 4].map(frame => computeTabTitle({ unread, current: { id: 'x', running: true, text: '', title: 'X' }, frame }))
    expect(titles.every(t => t.kind === 'unread-working' && t.animate)).toBe(true)
    expect(titles.map(t => t.title)).toEqual([0, 1, 2, 3, 0].map(i => '(2) ' + TAB_FRAMES[i]))
  })
  it('unread and the open chat idle: unchanged, the newest unread reply', () => {
    const r = computeTabTitle({ unread, current: { id: 'x', running: false, text: 'mine', title: 'X' }, frame: 3 })
    expect(r).toEqual({ title: '(2) Newest', kind: 'unread', animate: false })
  })
  it('unread and no chat open: the newest unread reply', () => {
    expect(computeTabTitle({ unread, current: null, frame: 0 }).title).toBe('(2) Newest')
  })
})

describe('unread set (shared by the title and the row markers)', () => {
  const tracker = () => createSeenTracker({ load: () => null, save: () => {}, seed: () => ({}) })
  const entries = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C', blank: true }, { id: 'd', title: 'D' }]
  const stamps: Record<string, number> = { a: 100, b: 200, c: 300 }
  it('completed chats are unread; never-completed and blank ones are not', () => {
    const u = collectUnread({ entries, completedAt: id => stamps[id], seen: tracker(), onScreen: null, visible: true })
    expect(u.map(x => x.id)).toEqual(['a', 'b'])
  })
  it('the chat on screen in a visible tab is read, and stays read after leaving it', () => {
    const seen = tracker()
    expect(collectUnread({ entries, completedAt: id => stamps[id], seen, onScreen: 'a', visible: true }).map(x => x.id)).toEqual(['b'])
    expect(collectUnread({ entries, completedAt: id => stamps[id], seen, onScreen: 'b', visible: true }).map(x => x.id)).toEqual([])
  })
  it('a hidden tab does not read the chat on screen', () => {
    const seen = tracker()
    expect(collectUnread({ entries, completedAt: id => stamps[id], seen, onScreen: 'a', visible: false }).map(x => x.id)).toEqual(['a', 'b'])
  })
  it('a newer completion after it was read is unread again', () => {
    const seen = tracker()
    collectUnread({ entries, completedAt: id => stamps[id], seen, onScreen: 'a', visible: true })
    expect(collectUnread({ entries, completedAt: id => (id === 'a' ? 150 : undefined), seen, onScreen: null, visible: true }).map(x => x.id)).toEqual(['a'])
  })
})

describe('blue row marker', () => {
  const entries: CatalogEntry[] = Array.from({ length: 4 }, (_, i) => ({ id: 's' + i, title: 'Chat ' + i, workspaceId: null, blank: false, updatedAt: Date.now() - 60_000 }))
  const setup = (unread: Set<string>, running = new Set<string>(), mutate?: (s: RailState) => void) => {
    document.body.replaceChildren()
    const base = normalizeRailState(EMPTY_RAIL_STATE)
    mutate?.(base)
    const store = createRailStore(createMemoryPersistence(base))
    const panel = new RailPanel({
      store,
      sessionTitle: id => id,
      isRunning: id => running.has(id),
      isUnread: id => unread.has(id),
      recents: () => {
        const s = store.getSnapshot()
        return buildRecents(entries, { pinnedIds: s.pinned, memberships: s.memberships, projects: {}, stripes: s.stripes })
      },
      search: () => [],
    })
    panel.mountLauncher()
    panel.open()
    return panel
  }
  const rowOf = (id: string) => [...document.querySelectorAll<HTMLElement>('.wr-row')].find(r => r.dataset.sessionId === id || r.dataset.rowKey === 'S:' + id)
  it('marks exactly the unread chats, labelled, after the title and before the time and the menu', () => {
    setup(new Set(['s1', 's3']))
    for (const id of ['s0', 's2']) expect(rowOf(id)?.querySelector('.wr-unread') ?? null).toBeNull()
    for (const id of ['s1', 's3']) {
      const row = rowOf(id)!
      const dot = row.querySelector<HTMLElement>('.wr-unread')!
      expect(dot.getAttribute('aria-label')).toBe('Unread reply')
      expect(dot.title).toBe('Unread reply')
      const kids = [...row.children]
      const i = kids.indexOf(dot)
      expect(kids.findIndex(k => k.classList.contains('wr-title'))).toBeLessThan(i)
      const time = kids.findIndex(k => k.classList.contains('wr-time'))
      if (time >= 0) expect(time).toBeGreaterThan(i)
      expect(kids.findIndex(k => k.classList.contains('wr-dots'))).toBeGreaterThan(i)
    }
  })
  it('sits next to the working kitty without replacing it', () => {
    setup(new Set(['s2']), new Set(['s2']))
    const row = rowOf('s2')!
    expect(row.querySelector('.wr-unread')).not.toBeNull()
    expect(row.querySelector('.wr-working')).not.toBeNull()
  })
  it('pinned rows carry it too; it goes once the chat is read', () => {
    const unread = new Set(['s0'])
    const panel = setup(unread, new Set(), s => { s.pinned = ['s0'] })
    const pinnedRow = document.querySelector<HTMLElement>('[data-row-key="S:s0"]')!
    expect(pinnedRow.querySelector('.wr-unread')).not.toBeNull()
    unread.delete('s0')
    panel.render()
    expect(document.querySelector('[data-row-key="S:s0"] .wr-unread')).toBeNull()
    expect(document.querySelectorAll('.wr-unread').length).toBe(0)
  })
})
