// @vitest-environment jsdom
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest'
import { RailPanel } from '../src/rail-ui.ts'
import { createMemoryPersistence, createRailStore, normalizeRailState, EMPTY_RAIL_STATE, type RailState } from '../src/store.ts'
import { buildRecents, type CatalogEntry } from '../src/catalog.ts'
import { createProject, moveSessionToProject } from '../src/projects.ts'

const entries: CatalogEntry[] = ['Alpha', 'Beta', 'Gamma', 'Delta'].map((t, i) => ({ id: 's' + i, title: t, workspaceId: null, blank: false }))
const tick = (): Promise<void> => new Promise(r => setTimeout(r, 5))

function setup(opts: { members?: string[]; health?: Record<string, { status: string }> } = {}) {
  document.body.replaceChildren()
  let s = normalizeRailState(EMPTY_RAIL_STATE)
  s = { ...s, ...createProject(s, 'Acme legal') }
  const pid = s.projectOrder[0]!
  for (const m of opts.members ?? []) s = { ...s, ...moveSessionToProject(s, m, pid) }
  const store = createRailStore(createMemoryPersistence(s))
  const openSession = vi.fn()
  const openFile = vi.fn(() => true)
  const createSession = vi.fn(async () => 'new1')
  const panel = new RailPanel({
    store,
    sessionTitle: id => entries.find(e => e.id === id)?.title ?? id,
    recents: () => {
      const st: RailState = store.getSnapshot()
      return buildRecents(entries, { pinnedIds: st.pinned, memberships: st.memberships, projects: st.projects as Record<string, { hueKey: string }>, stripes: st.stripes })
    },
    search: () => [],
    openSession, openFile, createSession,
    docHealth: () => (opts.health ?? {}) as never,
  })
  panel.open(document.body)
  ;(document.querySelector('.wr-proj') as HTMLElement).click()
  return { panel, store, pid, openSession, openFile, createSession }
}
const drawer = (): HTMLElement => document.querySelector('.wr-drawer') as HTMLElement
const chatRows = (): HTMLElement[] => [...drawer().querySelectorAll('.wr-psection:not(.wr-files) .wr-row[data-session-id]')] as HTMLElement[]
const btn = (label: string): HTMLElement => [...drawer().querySelectorAll('button')].find(b => b.textContent === label) as HTMLElement
const toast = (): HTMLElement | null => document.querySelector('.wr-toast')

describe('project view', () => {
  it('lists the project chats first, as openable rows', () => {
    const { openSession } = setup({ members: ['s1', 's3'] })
    expect(chatRows().map(r => r.textContent?.includes('Beta') || r.textContent?.includes('Delta'))).toEqual([true, true])
    chatRows()[0]!.click()
    expect(openSession).toHaveBeenCalledWith('s1')
    const labels = [...drawer().querySelectorAll('.wr-plabel')].map(l => l.firstChild?.textContent)
    expect(labels).toEqual(['Chats', 'Files'])
  })

  it('"Add chats" picks from the other chats and adds instantly, with Undo', async () => {
    const { store, pid } = setup({ members: ['s1'] })
    btn('Add chats…').click()
    const items = [...drawer().querySelectorAll('.wr-pickitem')].map(i => i.textContent)
    expect(items.some(t => t?.includes('Beta'))).toBe(false) // already a member
    ;([...drawer().querySelectorAll('.wr-pickitem')].find(i => i.textContent?.includes('Gamma')) as HTMLElement).click()
    expect(store.getSnapshot().memberships.s2).toBe(pid)
    expect(chatRows()).toHaveLength(2)
    expect(toast()?.textContent).toContain('Moved “Gamma”')
    ;(toast()!.querySelector('button') as HTMLElement).click()
    expect(store.getSnapshot().memberships.s2).toBeUndefined()
  })

  it('+ New chat creates, files it in the project and opens it', async () => {
    const { store, pid, createSession, openSession } = setup()
    btn('+ New chat').click()
    await tick()
    expect(createSession).toHaveBeenCalled()
    expect(store.getSnapshot().memberships.new1).toBe(pid)
    expect(openSession).toHaveBeenCalledWith('new1')
  })

  it('adding a file is one field: paste a path, Enter; name and kind are inferred', () => {
    const { store } = setup()
    const f = drawer().querySelector('.wr-files input.wr-pfield') as HTMLInputElement
    f.value = '/home/alice/acme/privacy-policy.md'
    f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const docs = Object.values(store.getSnapshot().docs)
    expect(docs.map(d => [d.name, d.kind, d.pointer])).toEqual([['privacy-policy.md', 'document', '/home/alice/acme/privacy-policy.md']])
    expect(drawer().querySelector('.wr-file .wr-fdir')?.textContent).toBe('~/acme')
  })

  it('dropping text adds every path; a duplicate is refused with a message', () => {
    const { store } = setup()
    const files = drawer().querySelector('.wr-files') as HTMLElement
    const drop = (text: string): void => {
      const ev = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer: unknown }
      ev.dataTransfer = { getData: (t: string) => (t === 'text/plain' ? text : ''), files: [] }
      ;(document.querySelector('.wr-files') as HTMLElement).dispatchEvent(ev)
    }
    void files
    drop('/srv/a.csv\n/srv/b.py')
    expect(Object.values(store.getSnapshot().docs).map(d => d.kind).sort()).toEqual(['data', 'snippet'])
    drop('/srv/a.csv')
    expect(Object.keys(store.getSnapshot().docs)).toHaveLength(2)
    expect(toast()?.textContent).toContain('Already in this project')
  })

  it('clicking a file opens it in the editor; missing files are flagged with a one-click cleanup', () => {
    const { store, openFile } = setup()
    const f = drawer().querySelector('.wr-files input.wr-pfield') as HTMLInputElement
    f.value = '/srv/gone.md'
    f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    ;(drawer().querySelector('.wr-file') as HTMLElement).click()
    expect(openFile).toHaveBeenCalledWith('/srv/gone.md')
    void store
  })
  it('a file the server cannot find is flagged, and one click removes the missing ones (undoable)', () => {
    document.body.replaceChildren()
    let s = normalizeRailState(EMPTY_RAIL_STATE)
    s = { ...s, ...createProject(s, 'P') }
    const pid = s.projectOrder[0]!
    s = { ...s, docs: { d1: { id: 'd1', projectId: pid, kind: 'document', name: 'gone.md', pointer: '/srv/gone.md' }, d2: { id: 'd2', projectId: pid, kind: 'data', name: 'ok.csv', pointer: '/srv/ok.csv' } } }
    const store = createRailStore(createMemoryPersistence(s))
    const panel = new RailPanel({ store, sessionTitle: id => id, recents: () => [], search: () => [], docHealth: () => ({ d1: { status: 'missing' } }) as never })
    panel.open(document.body)
    ;(document.querySelector('.wr-proj') as HTMLElement).click()
    const missing = [...document.querySelectorAll('.wr-file.wr-missing')]
    expect(missing).toHaveLength(1)
    expect(missing[0]!.textContent).toContain('Not found')
    btn('Remove 1 missing file').click()
    expect(Object.keys(store.getSnapshot().docs)).toEqual(['d2'])
    ;(toast()!.querySelector('button') as HTMLElement).click()
    expect(Object.keys(store.getSnapshot().docs).sort()).toEqual(['d1', 'd2'])
  })

  it('a redraw while typing keeps the text, the caret and the focus (the flicker bug)', () => {
    const { panel } = setup()
    const f = drawer().querySelector('.wr-files input.wr-pfield') as HTMLInputElement
    f.focus(); f.value = '/srv/half-typ'; f.setSelectionRange(5, 5)
    panel.render()
    const g = drawer().querySelector('.wr-files input.wr-pfield') as HTMLInputElement
    expect(g).not.toBe(f)
    expect(g.value).toBe('/srv/half-typ')
    expect(document.activeElement).toBe(g)
    expect(g.selectionStart).toBe(5)
  })

  it('Upload sends the files and lists each uploaded file in the project', async () => {
    document.body.replaceChildren()
    let s0 = normalizeRailState(EMPTY_RAIL_STATE)
    s0 = { ...s0, ...createProject(s0, 'P') }
    const pid = s0.projectOrder[0]!
    const store = createRailStore(createMemoryPersistence(s0))
    const uploadFiles = vi.fn(async (_pid: string, files: File[]) => files.map(f => ({ name: f.name, path: '/home/u/dsh-projects/p/' + f.name })))
    const panel = new RailPanel({ store, sessionTitle: id => id, recents: () => [], search: () => [], uploadFiles })
    panel.open(document.body)
    ;(document.querySelector('.wr-proj') as HTMLElement).click()
    expect(btn('↑ Upload files')).toBeTruthy()
    await panel.uploadInto(pid, [new File(['a'], 'brief.pdf'), new File(['b'], 'rows.csv')])
    expect(uploadFiles).toHaveBeenCalledTimes(1)
    const docs = Object.values(store.getSnapshot().docs).map(d => [d.name, d.kind]).sort()
    expect(docs).toEqual([['brief.pdf', 'document'], ['rows.csv', 'data']])
    expect(toast()?.textContent).toContain('Uploaded 2 files')
  })

  it('instructions: the card opens an editor; Save stores them and refreshes the project folder', async () => {
    document.body.replaceChildren()
    let s0 = normalizeRailState(EMPTY_RAIL_STATE)
    s0 = { ...s0, ...createProject(s0, 'P') }
    const pid = s0.projectOrder[0]!
    const store = createRailStore(createMemoryPersistence(s0))
    const ensureProject = vi.fn(async () => '/home/u/dsh-projects/p')
    const panel = new RailPanel({ store, sessionTitle: id => id, recents: () => [], search: () => [], ensureProject })
    panel.open(document.body)
    ;(document.querySelector('.wr-proj') as HTMLElement).click()
    ;(drawer().querySelector('.wr-instrcard') as HTMLElement).click()
    const ta = drawer().querySelector('textarea') as HTMLTextAreaElement
    ta.value = 'Cite GDPR articles.'
    ;(drawer().querySelectorAll('.wr-check input')[0] as HTMLInputElement).click()
    btn('Save').click()
    await tick()
    expect(store.getSnapshot().projects[pid]).toMatchObject({ instructions: 'Cite GDPR articles.', memory: true, strict: false })
    expect(ensureProject).toHaveBeenCalledWith(pid)
    expect(drawer().querySelector('.wr-instrcard')?.textContent).toContain('Cite GDPR articles.')
    expect(drawer().querySelector('.wr-instrcard')?.textContent).toContain('Project memory')
  })

  it('project rows are plain (a colour square), not tinted like a selection', () => {
    setup()
    ;(drawer().querySelector('.wr-dclose') as HTMLElement).click()
    const row = document.querySelector('.wr-proj') as HTMLElement
    expect(row.style.background).toBe('')
    expect(row.querySelector('.wr-psq')).not.toBeNull()
  })

  it('archive hides the project behind "Archived (n)" and Undo/Unarchive restores it', () => {
    const { store, pid } = setup()
    ;(drawer().querySelector('.wr-dhead .wr-dots') as HTMLElement).click()
    ;([...drawer().querySelectorAll('.wr-menu button')].find(b => b.textContent === 'Archive project') as HTMLElement).click()
    expect(store.getSnapshot().projects[pid]!.archived).toBe(true)
    expect(document.querySelectorAll('.wr-proj:not(.wr-archived)')).toHaveLength(0)
    const toggle = document.querySelector('.wr-archtoggle') as HTMLElement
    expect(toggle.textContent).toContain('Archived (1)')
    toggle.click()
    expect(document.querySelectorAll('.wr-proj.wr-archived')).toHaveLength(1)
    ;(toast()!.querySelector('button') as HTMLElement).click()
    expect(store.getSnapshot().projects[pid]!.archived).toBeUndefined()
  })

  it('delete asks first and keeps the folder unless ticked', async () => {
    document.body.replaceChildren()
    let s0 = normalizeRailState(EMPTY_RAIL_STATE)
    s0 = { ...s0, ...createProject(s0, 'P') }
    const pid = s0.projectOrder[0]!
    s0.projects[pid] = { ...s0.projects[pid]!, dir: '/home/u/dsh-projects/p-1' }
    const store = createRailStore(createMemoryPersistence(s0))
    const deleteProjectFolder = vi.fn(async () => true)
    const panel = new RailPanel({ store, sessionTitle: id => id, recents: () => [], search: () => [], deleteProjectFolder })
    panel.open(document.body)
    ;(document.querySelector('.wr-proj') as HTMLElement).click()
    ;(drawer().querySelector('.wr-dhead .wr-dots') as HTMLElement).click()
    ;([...drawer().querySelectorAll('.wr-menu button')].find(b => b.textContent === 'Delete project…') as HTMLElement).click()
    expect(drawer().querySelector('.wr-confirm')).not.toBeNull()
    expect(store.getSnapshot().projects[pid]).toBeDefined()
    ;(drawer().querySelector('.wr-confirm input[type=checkbox]') as HTMLInputElement).click()
    ;([...drawer().querySelectorAll('.wr-confirm button')].find(b => b.textContent === 'Delete') as HTMLElement).click()
    await tick()
    expect(deleteProjectFolder).toHaveBeenCalledWith(pid)
    expect(store.getSnapshot().projects[pid]).toBeUndefined()
  })

  it('the default model is picked from the catalog and saved with its effort', async () => {
    document.body.replaceChildren()
    let s0 = normalizeRailState(EMPTY_RAIL_STATE)
    s0 = { ...s0, ...createProject(s0, 'P') }
    const pid = s0.projectOrder[0]!
    const store = createRailStore(createMemoryPersistence(s0))
    const modelCatalog = vi.fn(async () => [{ id: 'anthropic', name: 'Anthropic', models: [{ id: 'opus', name: 'Opus', reasoning: { efforts: [{ id: 'high', name: 'High' }] } }] }])
    const panel = new RailPanel({ store, sessionTitle: id => id, recents: () => [], search: () => [], modelCatalog, ensureProject: async () => '/d' })
    panel.open(document.body)
    ;(document.querySelector('.wr-proj') as HTMLElement).click()
    ;(drawer().querySelector('.wr-instrcard') as HTMLElement).click()
    await tick()
    const [mSel, eSel] = [...drawer().querySelectorAll('.wr-modelrow select')] as HTMLSelectElement[]
    mSel!.value = 'anthropic\u0001opus'; mSel!.dispatchEvent(new Event('change'))
    eSel!.value = 'high'
    btn('Save').click()
    await tick()
    expect(store.getSnapshot().projects[pid]!.model).toEqual({ provider: 'anthropic', model: 'opus', reasoningEffort: 'high' })
    expect(drawer().querySelector('.wr-instrcard')?.textContent).toContain('Opus · high')
  })
})
