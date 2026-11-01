// @vitest-environment jsdom
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { RailPanel } from '../src/rail-ui.ts'
import { createMemoryPersistence, createRailStore, normalizeRailState, EMPTY_RAIL_STATE, type RailState } from '../src/store.ts'
import { buildRecents, type CatalogEntry } from '../src/catalog.ts'

const entries: CatalogEntry[] = Array.from({ length: 5 }, (_, i) => ({ id: 's' + i, title: 'Session ' + i, workspaceId: null, blank: false }))

const setup = () => {
  document.body.replaceChildren()
  const store = createRailStore(createMemoryPersistence(normalizeRailState(EMPTY_RAIL_STATE)))
  const running = new Set(['s1'])
  const deleted: string[] = []
  const panel = new RailPanel({
    store,
    sessionTitle: id => id,
    isHidden: id => store.getSnapshot().binned[id] !== undefined,
    isRunning: id => running.has(id),
    binned: () => Object.entries(store.getSnapshot().binned).map(([id, at]) => ({ id, title: id, at })),
    deleteForever: async id => { deleted.push(id); return true },
    recents: () => {
      const s: RailState = store.getSnapshot()
      return buildRecents(entries.filter(e => s.binned[e.id] === undefined), { pinnedIds: s.pinned, memberships: s.memberships, projects: {}, stripes: s.stripes })
    },
    search: () => [],
  })
  panel.mountLauncher()
  panel.open()
  return { panel, store, deleted }
}
const root = (): Element => document.body.querySelector('.__dsh-workspace-rail__')!

describe('working indicator + bin', () => {
  it('marks only running chats, in the chosen style', () => {
    const { store } = setup()
    expect(root().querySelectorAll('.wr-kitty')).toHaveLength(1)
    store.update(d => { d.workingIndicator = 'dots' })
    expect(root().querySelectorAll('.wr-dots3')).toHaveLength(1)
    store.update(d => { d.workingIndicator = 'off' })
    expect(root().querySelectorAll('.wr-working')).toHaveLength(0)
  })

  it('bin hides a chat, lists it, restores it', () => {
    const { store } = setup()
    store.update(d => { d.binned['s2'] = Date.now() })
    expect(root().textContent).not.toContain('Session 2')
    ;(root().querySelector('.wr-binbtn') as HTMLElement).click()
    const drawer = root().querySelector('.wr-bindrawer')!
    expect(drawer.textContent).toContain('s2')
    ;(drawer.querySelector('.wr-binact') as HTMLElement).click()
    expect(store.getSnapshot().binned['s2']).toBeUndefined()
  })

  it('delete forever needs a second click', async () => {
    const { store, deleted } = setup()
    store.update(d => { d.binned['s3'] = Date.now() })
    ;(root().querySelector('.wr-binbtn') as HTMLElement).click()
    ;(root().querySelector('.wr-bindel') as HTMLElement).click()
    expect(deleted).toEqual([])
    ;(root().querySelector('.wr-bindel') as HTMLElement).click()
    expect(deleted).toEqual(['s3'])
  })
})
