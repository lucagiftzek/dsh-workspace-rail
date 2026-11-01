// @vitest-environment jsdom
// SPDX-License-Identifier: Apache-2.0
// The "Stripe color" menu entry used to silently cycle one hue per click and
// close the menu, so it looked like it did nothing. It is now a swatch picker.
import { describe, expect, it } from 'vitest'
import { RailPanel } from '../src/rail-ui.ts'
import { createMemoryPersistence, createRailStore, normalizeRailState, EMPTY_RAIL_STATE, type RailState } from '../src/store.ts'
import { buildRecents, type CatalogEntry } from '../src/catalog.ts'
import { HUES } from '../src/palette.ts'

const entries: CatalogEntry[] = Array.from({ length: 5 }, (_, i) => ({ id: 's' + i, title: 'Session ' + i, workspaceId: null, blank: false }))

function setup(): ReturnType<typeof createRailStore> {
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
  panel.open(document.body)
  return store
}

const rowOf = (id: string): HTMLElement => document.querySelector(`.wr-row[data-session-id="${id}"]`) as HTMLElement
const openMenu = (id: string): void => { (rowOf(id).querySelector('.wr-dots') as HTMLElement).click() }

describe('stripe color picker', () => {
  it('shows all hues plus "none", and picking one applies it and draws the stripe', () => {
    const store = setup()
    openMenu('s1')
    const swatches = [...document.querySelectorAll('.wr-menu .wr-sw')] as HTMLElement[]
    expect(swatches).toHaveLength(Object.keys(HUES).length + 1)
    const teal = swatches.find(b => b.title === 'Teal') as HTMLElement
    teal.click()
    expect(store.getSnapshot().stripes.s1).toBe('teal')
    expect(document.querySelector('.wr-menu')).toBeNull()
    expect(rowOf('s1').querySelector('.wr-stripe')).not.toBeNull()
  })

  it('marks the current hue and "none" clears it', () => {
    const store = setup()
    store.update(d => { d.stripes.s2 = 'rose' })
    openMenu('s2')
    const pressed = document.querySelector('.wr-menu .wr-sw[aria-pressed="true"]') as HTMLElement
    expect(pressed.title).toBe('Rose')
    ;(document.querySelector('.wr-menu .wr-sw-none') as HTMLElement).click()
    expect(store.getSnapshot().stripes.s2).toBeUndefined()
    expect(rowOf('s2').querySelector('.wr-stripe')).toBeNull()
  })
})
