// @vitest-environment jsdom
// 2026-09-27: chats moved to the trash / archived must vanish from every Rail list,
// as they do in the stock sidebar. The catalog filter (client.ts) covers Recents
// and search; the panel's isHidden dep covers Pinned and project members, which
// are keyed by stored ids rather than the catalog.
import { describe, expect, it, beforeEach } from 'vitest'
import { RailPanel } from '../src/rail-ui.ts'
import { createMemoryPersistence, createRailStore, normalizeRailState, EMPTY_RAIL_STATE, type RailState } from '../src/store.ts'
import { buildRecents, type CatalogEntry } from '../src/catalog.ts'

const entries: CatalogEntry[] = [
  { id: 'live', title: 'Live chat', workspaceId: null, blank: false },
  { id: 'gone', title: 'Trashed chat', workspaceId: null, blank: false },
]

const setup = (hidden: ReadonlySet<string>) => {
  document.body.replaceChildren()
  const store = createRailStore(createMemoryPersistence(normalizeRailState({ ...EMPTY_RAIL_STATE, pinned: ['live', 'gone'] })))
  const panel = new RailPanel({
    store,
    sessionTitle: id => entries.find(e => e.id === id)?.title ?? id,
    isHidden: id => hidden.has(id),
    recents: () => {
      const s: RailState = store.getSnapshot()
      return buildRecents(entries.filter(e => !hidden.has(e.id)), { pinnedIds: s.pinned, memberships: s.memberships, projects: s.projects as Record<string, { hueKey: string }>, stripes: s.stripes })
    },
    search: () => [],
  })
  panel.mountLauncher()
  panel.open()
  return panel
}

describe('archived / trashed chats', () => {
  beforeEach(() => { document.body.replaceChildren() })

  it('are listed while not archived (control)', () => {
    setup(new Set())
    const pinned = document.querySelector('.wr-pinned')?.textContent ?? ''
    expect(pinned).toContain('Trashed chat')
  })

  it('disappear from Pinned and Recents once archived', () => {
    setup(new Set(['gone']))
    const text = document.querySelector('.__dsh-workspace-rail__')?.textContent ?? ''
    expect(text).toContain('Live chat')
    expect(text).not.toContain('Trashed chat')
  })
})
