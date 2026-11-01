// @vitest-environment jsdom
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { RailPanel } from '../src/rail-ui.ts'
import { createMemoryPersistence, createRailStore, normalizeRailState, EMPTY_RAIL_STATE, type RailState } from '../src/store.ts'
import { buildRecents, type CatalogEntry } from '../src/catalog.ts'

const entries: CatalogEntry[] = Array.from({ length: 12 }, (_, i) => ({ id: 's' + i, title: 'Chat ' + i, workspaceId: null, blank: false }))
function setup() {
  document.body.replaceChildren()
  const s = { ...normalizeRailState(EMPTY_RAIL_STATE), pinned: entries.slice(0, 9).map(e => e.id) }
  const store = createRailStore(createMemoryPersistence(s))
  const panel = new RailPanel({
    store, sessionTitle: id => entries.find(e => e.id === id)?.title ?? id, search: () => [],
    recents: () => { const st: RailState = store.getSnapshot(); return buildRecents(entries, { pinnedIds: st.pinned, memberships: st.memberships, projects: st.projects as Record<string, { hueKey: string }>, stripes: st.stripes }) },
  })
  panel.open(document.body)
  return { panel, store }
}
const pinned = (): HTMLElement => document.querySelector('.wr-pinned') as HTMLElement

describe('resizable, foldable sections', () => {
  it('the header sits outside the scrolling list, which is N rows tall', () => {
    setup()
    const list = pinned().querySelector('.wr-slist') as HTMLElement
    expect(list.contains(pinned().querySelector('.wr-label'))).toBe(false)
    expect(list.style.maxHeight).toBe(String(6 * 32) + 'px')
    expect(list.querySelectorAll('.wr-row')).toHaveLength(9)
    expect(pinned().querySelector('.wr-label .wr-count')?.textContent).toBe('9')
  })

  it('clicking the header folds and unfolds the section (persisted)', () => {
    const { store } = setup()
    ;(pinned().querySelector('.wr-fold') as HTMLElement).click()
    expect(store.getSnapshot().collapsedSections).toEqual(['pinned'])
    expect(pinned().querySelector('.wr-slist')).toBeNull()
    ;(pinned().querySelector('.wr-fold') as HTMLElement).click()
    expect(store.getSnapshot().collapsedSections).toEqual([])
  })

  it('dragging the handle changes the row count in whole rows', () => {
    const { store } = setup()
    const h = pinned().querySelector('.wr-resize') as HTMLElement
    const ev = (type: string, y: number) => { const e = new MouseEvent(type, { clientY: y, bubbles: true }) as MouseEvent & { pointerId: number }; e.pointerId = 1; h.dispatchEvent(e) }
    ev('pointerdown', 100); ev('pointermove', 100 + 3 * 32 + 5); ev('pointerup', 0)
    expect(store.getSnapshot().sectionRows.pinned).toBe(9)
  })

  it('settings: steppers change rows within 1..30; the edge picker is a wrapped select', () => {
    const { store } = setup()
    ;(document.querySelector('.wr-footer button') as HTMLElement).click()
    const [minus] = [...document.querySelectorAll('.wr-stepper')][1]!.querySelectorAll('button')
    for (let i = 0; i < 10; i++) (document.querySelectorAll('.wr-stepper')[1]!.querySelectorAll('button')[0] as HTMLElement).click()
    void minus
    expect(store.getSnapshot().sectionRows.projects).toBe(1)
    expect(document.querySelector('.wr-select > select')).not.toBeNull()
  })
})
