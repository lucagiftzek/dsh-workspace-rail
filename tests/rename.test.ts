// @vitest-environment jsdom
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest'
import { RailPanel } from '../src/rail-ui.ts'
import { createMemoryPersistence, createRailStore, normalizeRailState, EMPTY_RAIL_STATE, type RailState } from '../src/store.ts'
import { buildRecents, type CatalogEntry } from '../src/catalog.ts'

type RenameResult = { ok: true; title: string } | { ok: false; error: string }
const tick = (): Promise<void> => new Promise(r => setTimeout(r, 5))

function setup(rename: (id: string, t: string) => Promise<RenameResult>) {
  document.body.replaceChildren()
  const titles = new Map([['s0', 'Alpha'], ['s1', 'Beta'], ['s2', 'Gamma']])
  const entries = (): CatalogEntry[] => [...titles].map(([id, title]) => ({ id, title, workspaceId: null, blank: false }))
  const store = createRailStore(createMemoryPersistence(normalizeRailState(EMPTY_RAIL_STATE)))
  const renameSession = vi.fn(rename)
  const openSession = vi.fn()
  const panel = new RailPanel({
    store,
    sessionTitle: id => titles.get(id) ?? id,
    recents: () => {
      const s: RailState = store.getSnapshot()
      return buildRecents(entries(), { pinnedIds: s.pinned, memberships: s.memberships, projects: s.projects as Record<string, { hueKey: string }>, stripes: s.stripes })
    },
    search: () => [],
    openSession,
    renameSession,
  })
  panel.open(document.body)
  return { panel, titles, renameSession, openSession }
}
const row = (id: string): HTMLElement => document.querySelector(`.wr-row[data-session-id="${id}"]`) as HTMLElement
const field = (): HTMLInputElement | null => document.querySelector('input.wr-rename')
const key = (el: HTMLElement, k: string): void => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) }

describe('rename a chat', () => {
  it('⋯ -> Rename opens an inline field with the whole title selected', async () => {
    setup(async (_id, t) => ({ ok: true, title: t }))
    ;(row('s1').querySelector('.wr-dots') as HTMLElement).click()
    ;([...document.querySelectorAll('.wr-menu button')].find(b => b.textContent === 'Rename') as HTMLElement).click()
    await tick()
    expect(field()?.value).toBe('Beta')
    expect(document.activeElement).toBe(field())
    expect([field()!.selectionStart, field()!.selectionEnd]).toEqual([0, 4])
  })

  it('a triple-click on the title starts it, without opening the chat twice', async () => {
    const { openSession } = setup(async (_id, t) => ({ ok: true, title: t }))
    const title = row('s0').querySelector('.wr-title') as HTMLElement
    for (const detail of [1, 2, 3]) title.dispatchEvent(new MouseEvent('click', { detail, bubbles: true }))
    await tick()
    expect(field()?.value).toBe('Alpha')
    expect(openSession).toHaveBeenCalledTimes(1) // only the first click navigates
  })

  it('Enter saves through the host and shows the new title at once', async () => {
    const { renameSession } = setup(async (_id, t) => ({ ok: true, title: t }))
    const { panel } = { panel: null }
    void panel
    ;(row('s2').querySelector('.wr-dots') as HTMLElement).click()
    ;([...document.querySelectorAll('.wr-menu button')].find(b => b.textContent === 'Rename') as HTMLElement).click()
    await tick()
    const f = field()!
    f.value = '  Gamma renamed  '
    f.dispatchEvent(new Event('input'))
    key(f, 'Enter')
    expect(renameSession).toHaveBeenCalledWith('s2', 'Gamma renamed')
    expect(field()).toBeNull()
    expect(row('s2').querySelector('.wr-title')?.textContent).toBe('Gamma renamed')
  })

  it('Esc cancels without calling the host', async () => {
    const { renameSession } = setup(async (_id, t) => ({ ok: true, title: t }))
    ;(row('s0').querySelector('.wr-dots') as HTMLElement).click()
    ;([...document.querySelectorAll('.wr-menu button')].find(b => b.textContent === 'Rename') as HTMLElement).click()
    await tick()
    field()!.value = 'nope'
    field()!.dispatchEvent(new Event('input'))
    key(field()!, 'Escape')
    expect(renameSession).not.toHaveBeenCalled()
    expect(row('s0').querySelector('.wr-title')?.textContent).toBe('Alpha')
  })

  it('a re-render mid-edit (host list update) keeps the draft and focus', async () => {
    const { panel } = setup(async (_id, t) => ({ ok: true, title: t }))
    panel.startRename('s1', 'Beta')
    await tick()
    field()!.value = 'Beta v2'
    field()!.dispatchEvent(new Event('input'))
    panel.render()
    await tick()
    expect(field()?.value).toBe('Beta v2')
    expect(document.activeElement).toBe(field())
  })

  it('a rejected rename reopens the field with the typed text and the reason', async () => {
    setup(async () => ({ ok: false, error: 'title too long' }))
    const { panel } = { panel: null }
    void panel
    ;(row('s1').querySelector('.wr-dots') as HTMLElement).click()
    ;([...document.querySelectorAll('.wr-menu button')].find(b => b.textContent === 'Rename') as HTMLElement).click()
    await tick()
    field()!.value = 'X'.repeat(10)
    field()!.dispatchEvent(new Event('input'))
    key(field()!, 'Enter')
    await tick()
    expect(field()?.value).toBe('X'.repeat(10))
    expect(field()?.title).toContain('title too long')
    expect(field()?.classList.contains('wr-rename-error')).toBe(true)
  })
})
