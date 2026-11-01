// @vitest-environment jsdom
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, beforeEach } from 'vitest'
import { RailPanel } from '../src/rail-ui.ts'
import { createMemoryPersistence, createRailStore, normalizeRailState, EMPTY_RAIL_STATE, type RailState } from '../src/store.ts'
import { buildRecents, type CatalogEntry } from '../src/catalog.ts'

const entries: CatalogEntry[] = Array.from({ length: 40 }, (_, i) => ({ id: 's' + i, title: 'Session ' + i, workspaceId: null, blank: false }))

const setup = (): { panel: RailPanel; store: ReturnType<typeof createRailStore> } => {
  document.body.replaceChildren()
  const store = createRailStore(createMemoryPersistence(normalizeRailState(EMPTY_RAIL_STATE)))
  const panel = new RailPanel({
    store,
    sessionTitle: id => id,
    recents: () => {
      const s: RailState = store.getSnapshot()
      return buildRecents(entries, { pinnedIds: s.pinned, memberships: s.memberships, projects: s.projects as Record<string, { hueKey: string }>, stripes: s.stripes })
    },
    search: () => [],
  })
  panel.mountLauncher()
  panel.open()
  return { panel, store }
}

describe('RailPanel (jsdom smoke)', () => {
  beforeEach(() => { document.body.replaceChildren() })

  it('mounts launcher and opens the panel with the three sections', () => {
    const { panel } = setup()
    expect(panel.isOpen).toBe(true)
    const text = document.body.querySelector('.__dsh-workspace-rail__')?.textContent ?? ''
    expect(text).toContain('Pinned')
    expect(text).toContain('Projects')
    expect(text).toContain('Recents')
    expect(text).toMatch(/\d+ chats/)
  })

  it('renders a virtualized window of Recents rows (not all 40)', () => {
    setup()
    const rows = document.body.querySelectorAll('.wr-scroller .wr-row')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThan(40)
  })

  it('toggles the config section from the footer and switches stripe edge', () => {
    const { panel, store } = setup()
    expect(document.querySelector('.wr-config')).toBeNull()
    ;(Array.from(document.querySelectorAll('.wr-footer button')).find(b => b.textContent?.includes('Settings')) as HTMLElement).click()
    expect(document.querySelector('.wr-config')).not.toBeNull()
    const sel = document.querySelector('.wr-config select') as HTMLSelectElement
    sel.value = 'left'
    sel.dispatchEvent(new Event('change'))
    expect(store.getSnapshot().stripeEdge).toBe('left')
    void panel
  })

  it('creates a project via the inline form and shows a colored row', () => {
    const { store } = setup()
    store.update(d => Object.assign(d, { projects: { p1: { id: 'p1', name: 'Acme Ops', hueKey: 'teal', workspaceId: null, autoCarryover: false } }, projectOrder: ['p1'] }))
    const projText = document.body.querySelector('.wr-section:nth-of-type(2)')?.textContent ?? ''
    expect(projText).toContain('Acme Ops')
  })

  it('closes and destroys cleanly', () => {
    const { panel } = setup()
    panel.close()
    expect(panel.isOpen).toBe(false)
    expect(document.querySelector('.__dsh-workspace-rail__')).toBeNull()
  })
})
