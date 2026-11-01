// @vitest-environment jsdom
// SPDX-License-Identifier: Apache-2.0
// Section expand (2.1): one section fills the sidebar, the others keep only
// their header rows; pressing again restores the previous layout exactly.
import { describe, expect, it } from 'vitest'
import { sectionView, toggleExpanded, toggleFold, type SectionLayout } from '../src/sections.ts'
import { RailPanel } from '../src/rail-ui.ts'
import { createMemoryPersistence, createRailStore, normalizeRailState, EMPTY_RAIL_STATE, type RailState } from '../src/store.ts'
import { mergeRailStates } from '../src/sync.ts'
import { buildRecents, type CatalogEntry } from '../src/catalog.ts'

describe('section layout reducer', () => {
  const base: SectionLayout = { collapsedSections: ['projects'], expandedSection: null }

  it('expanding shows only that section and leaves the saved layout untouched', () => {
    const ex = toggleExpanded(base, 'pinned')
    expect(ex).toEqual({ collapsedSections: ['projects'], expandedSection: 'pinned' })
    expect(sectionView(ex, 'pinned')).toEqual({ folded: false, expanded: true })
    expect(sectionView(ex, 'projects').folded).toBe(true)
    expect(sectionView(ex, 'recents').folded).toBe(true)
  })

  it('pressing again restores the previous layout exactly', () => {
    expect(toggleExpanded(toggleExpanded(base, 'recents'), 'recents')).toEqual(base)
  })

  it('a folded section can be expanded (expand wins over its own fold)', () => {
    const ex = toggleExpanded(base, 'projects')
    expect(sectionView(ex, 'projects')).toEqual({ folded: false, expanded: true })
    expect(toggleExpanded(ex, 'projects')).toEqual(base)
  })

  it('only one section is expanded at a time', () => {
    expect(toggleExpanded(toggleExpanded(base, 'pinned'), 'recents').expandedSection).toBe('recents')
  })

  it('a fold click flips what is shown and leaves the expanded view', () => {
    const ex = toggleExpanded(base, 'pinned')
    expect(toggleFold(ex, 'pinned')).toEqual({ collapsedSections: ['projects', 'pinned'], expandedSection: null })
    expect(toggleFold(ex, 'recents')).toEqual({ collapsedSections: ['projects'], expandedSection: null })
    expect(toggleFold(ex, 'projects')).toEqual({ collapsedSections: [], expandedSection: null })
    // Without an expansion it is the plain fold toggle.
    expect(toggleFold(base, 'recents')).toEqual({ collapsedSections: ['projects', 'recents'], expandedSection: null })
  })
})

describe('expanded state persistence', () => {
  it('normalize keeps a valid key and drops anything else', () => {
    expect(normalizeRailState({ expandedSection: 'projects' }).expandedSection).toBe('projects')
    expect(normalizeRailState({ expandedSection: 'bogus' }).expandedSection).toBeNull()
    expect(normalizeRailState({}).expandedSection).toBeNull()
  })
  it('round-trips through the state.json document and the host merge', () => {
    const s = { ...normalizeRailState(EMPTY_RAIL_STATE), expandedSection: 'recents' as const }
    const host = normalizeRailState(JSON.parse(JSON.stringify(s)))
    expect(host.expandedSection).toBe('recents')
    expect(mergeRailStates(host, normalizeRailState(EMPTY_RAIL_STATE)).merged.expandedSection).toBe('recents')
  })
})

describe('expand button in the panel', () => {
  const entries: CatalogEntry[] = Array.from({ length: 12 }, (_, i) => ({ id: 's' + i, title: 'Chat ' + i, workspaceId: null, blank: false }))
  function setup(extra: Partial<RailState> = {}) {
    document.body.replaceChildren()
    const s = { ...normalizeRailState(EMPTY_RAIL_STATE), pinned: entries.slice(0, 9).map(e => e.id), sectionRows: { pinned: 4, projects: 3 }, ...extra }
    const store = createRailStore(createMemoryPersistence(s))
    const panel = new RailPanel({
      store, sessionTitle: id => entries.find(e => e.id === id)?.title ?? id, search: () => [],
      recents: () => { const st: RailState = store.getSnapshot(); return buildRecents(entries, { pinnedIds: st.pinned, memberships: st.memberships, projects: st.projects as Record<string, { hueKey: string }>, stripes: st.stripes }) },
    })
    panel.open(document.body)
    return { panel, store }
  }
  const sec = (k: string): HTMLElement => document.querySelector('.wr-' + k) as HTMLElement
  const btn = (k: string): HTMLButtonElement => sec(k).querySelector('.wr-label .wr-expand') as HTMLButtonElement

  it('each header has the button first, with an accessible name and aria-expanded', () => {
    setup()
    for (const k of ['pinned', 'projects', 'recents']) {
      const b = btn(k)
      expect(b.parentElement?.firstElementChild).toBe(b)
      expect(b.getAttribute('aria-label')).toBe('Expand section')
      expect(b.title).toBe('Expand section')
      expect(b.getAttribute('aria-expanded')).toBe('false')
    }
  })

  it('expand fills the sidebar with that section, the others keep their header rows, and it restores exactly', () => {
    const { store } = setup({ collapsedSections: ['projects'] })
    btn('pinned').click()
    expect(store.getSnapshot().expandedSection).toBe('pinned')
    expect(sec('pinned').classList.contains('wr-expanded')).toBe(true)
    const list = sec('pinned').querySelector('.wr-slist') as HTMLElement
    expect(list.style.maxHeight).toBe('')
    expect(list.querySelectorAll('.wr-row')).toHaveLength(9)
    expect(sec('pinned').querySelector('.wr-resize')).toBeNull()
    expect(sec('projects').querySelector('.wr-slist')).toBeNull()
    expect(sec('recents').classList.contains('wr-collapsed')).toBe(true)
    expect(sec('recents').querySelector('.wr-scroller')).toBeNull()
    expect(sec('recents').querySelector('.wr-label')).not.toBeNull()
    expect(btn('pinned').getAttribute('aria-label')).toBe('Collapse section')
    expect(btn('pinned').getAttribute('aria-expanded')).toBe('true')

    btn('pinned').click()
    const back = store.getSnapshot()
    expect(back.expandedSection).toBeNull()
    expect(back.collapsedSections).toEqual(['projects'])
    expect(back.sectionRows).toEqual({ pinned: 4, projects: 3 })
    expect((sec('pinned').querySelector('.wr-slist') as HTMLElement).style.maxHeight).toBe(String(4 * 32) + 'px')
    expect(sec('recents').querySelector('.wr-scroller')).not.toBeNull()
  })

  it('switching the expanded section keeps a single one expanded', () => {
    const { store } = setup()
    btn('projects').click()
    btn('recents').click()
    expect(store.getSnapshot().expandedSection).toBe('recents')
    expect(document.querySelectorAll('.wr-expanded')).toHaveLength(1)
    expect(sec('pinned').querySelector('.wr-slist')).toBeNull()
  })

  it('keyboard: the pressed button keeps focus across the redraw', () => {
    setup()
    btn('recents').focus()
    btn('recents').click()
    expect(document.activeElement).toBe(btn('recents'))
    expect(btn('recents').getAttribute('aria-expanded')).toBe('true')
  })

  it('a stored expansion is shown on load', () => {
    setup({ expandedSection: 'projects' })
    expect(sec('projects').classList.contains('wr-expanded')).toBe(true)
    expect(sec('pinned').classList.contains('wr-collapsed')).toBe(true)
  })
})
