// SPDX-License-Identifier: Apache-2.0
/**
 * The rail panel (P1+P2): Pinned tree with folders (one-level nesting,
 * pixel/emoji icons, collapse), Projects with colored fill rows and a
 * workspace drawer (docs by pointer, member chats), virtualized Recents with
 * repeat indicators, and a row ... context menu (the ONLY unpin surface,
 * per spec). Fixed-position, outside React's tree. Vanilla DOM.
 * @module dsh-workspace-rail/rail-ui
 */

import type { RailState, RailStore } from './store.ts'
import type { RecentRow } from './catalog.ts'
import { VirtualList } from './virtual-list.ts'
import { RAIL_CSS } from './rail-style.ts'
import { HUE_KEYS, HUES, hue, stripeColor, type HueKey } from './palette.ts'
import { pixelIconSvg, PIXEL_VARIANTS } from './pixel-icons.ts'
import { assignSessionFolder, buildPinnedRows, createFolder, deleteFolder, moveFolder, movePinnedSession, reorderIds, toggleFolderCollapsed, unpinSession } from './folders.ts'
import { addDoc, createProject, deleteProject, listDocs, moveSessionToProject, projectMembers, removeDoc, renameProject } from './projects.ts'
import { applyCarryover, planCarryover, revertCarryover } from './carryover.ts'
import { docKindFor, docNameFor, isUrl, parsePointers, shortDir } from './files.ts'
import { instructionsPreview } from './instructions.ts'
import type { PointerHealth } from './host/pointer-health.ts'
import type { ScoredHit } from './scoring.ts'
import { sectionView, toggleExpanded, toggleFold, type SectionKey } from './sections.ts'

export interface RailPanelDeps {
  store: RailStore
  /** Current Recents rows (host-ordered). */
  recents(): readonly RecentRow[]
  /** Catalog title lookup for pinned rows. */
  sessionTitle(id: string): string
  /** True for chats the host has archived/trashed: never listed anywhere. */
  isHidden?(id: string): boolean
  /** True while the chat is working (a turn in flight, or a subagent of it). */
  isRunning?(id: string): boolean
  /** A reply this browser has not shown yet (blue marker on the row). */
  isUnread?(id: string): boolean
  /** Chats in the bin, newest first. */
  binned?(): Array<{ id: string; title: string; at: number }>
  /** Delete for good: the host archives the chat so it disappears everywhere (no un-archive). */
  deleteForever?(id: string): Promise<boolean>
  /** Graded search over the catalog + windows (top hits, already ranked). */
  search(query: string): Array<ScoredHit & { title: string }>
  /** Attempt to open a session (runtime-probed face; no-op when absent). */
  openSession?(id: string): void
  /** Host-verified pointer health for project docs. */
  docHealth?(): Record<string, PointerHealth>
  /** Ask the host to re-check a project's doc pointers. */
  requestPointerHealth?(projectIds: string[]): void
  /** Nudge the host-side window indexer (cooldown-guarded in the glue). */
  requestWindows?(): void
  warn?(message: string): void
  /** The session currently open in the conversation (highlighted). */
  currentId?(): string | null
  /** Switch the sidebar seat back to the other list view (Rail | Folders). */
  onSwitchView?(): void
  /** Rename a chat through the host (pins the title against auto-regeneration). */
  renameSession?(id: string, title: string): Promise<{ ok: true; title: string } | { ok: false; error: string }>
  /** Start a new chat on the host, optionally in a folder; resolves to its id (null when unavailable). */
  createSession?(cwd?: string): Promise<string | null>
  /** Create/refresh the project's folder and its AGENTS.md; resolves to the folder (null on failure). */
  ensureProject?(projectId: string): Promise<string | null>
  /** Chats whose working folder is `dir` (so chats started in a project folder belong to it). */
  folderMembers?(dir: string): string[]
  /** Start a chat in the project the way dsh's New Session does (its folder as a workspace); resolves to its id. */
  startProjectChat?(projectId: string): Promise<string | null>
  /** dsh's model catalog, grouped by provider (null when unavailable). */
  modelCatalog?(): Promise<ModelGroup[] | null>
  /** Remove the project's folder on the server (only ever inside the projects root). */
  deleteProjectFolder?(projectId: string): Promise<boolean>
  /** Upload local files into the project's folder. */
  uploadFiles?(projectId: string, files: File[]): Promise<Array<{ name: string; path?: string; error?: string }>>
  /** Open a project file in the host's editor; false when no editor is available. */
  openFile?(path: string): boolean
}

export interface ModelGroup {
  id: string
  name: string
  models: Array<{ id: string; name: string; reasoning?: { efforts: Array<{ id: string; name: string }>; defaultEffort?: string } }>
}

interface RenameState {
  id: string
  draft: string
  selStart: number
  selEnd: number
  error?: string
}

const PANEL_CLASS = '__dsh-workspace-rail__'
const LAUNCHER_CLASS = '__dsh-workspace-rail-launcher__'
const STYLE_ID = '__dsh-workspace-rail-style__'
const ROW_HEIGHT = 32

interface MenuItem {
  label: string
  action: () => void
  /** Render an inline swatch picker for this entity's stripe instead of a button. */
  swatchFor?: string
}
interface DrawerState { projectId: string }

function ensureStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID) !== null) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = RAIL_CSS
  doc.head.appendChild(style)
}

const SEARCH_SVG = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="7" cy="7" r="4.6"/><path d="M10.5 10.5 14 14"/></svg>'
/** Section expand: arrows pointing out (expand) / in (restore). */
const EXPAND_SVG = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="square" aria-hidden="true"><path d="M3.5 4 6 1.5 8.5 4M3.5 8 6 10.5 8.5 8"/></svg>'
const COLLAPSE_SVG = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="square" aria-hidden="true"><path d="M3.5 1 6 3.5 8.5 1M3.5 11 6 8.5 8.5 11M2 6h8"/></svg>'
const GEAR_SVG = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2 4h7M12 4h2M2 8h2M7 8h7M2 12h9M14 12h0"/><circle cx="10.5" cy="4" r="1.5"/><circle cx="5.5" cy="8" r="1.5"/><circle cx="12.5" cy="12" r="1.5"/></svg>'

/** Compact relative age: 45s, 12m, 6h, 3d, 5w, 2y. */
export function relativeAge(ts: number | undefined, now: number = Date.now()): string {
  if (ts === undefined || !Number.isFinite(ts) || ts <= 0) return ''
  const sec = Math.max(0, Math.round((now - ts) / 1000))
  if (sec < 60) return 'now'
  const min = Math.round(sec / 60); if (min < 60) return min + 'm'
  const hr = Math.round(min / 60); if (hr < 24) return hr + 'h'
  const day = Math.round(hr / 24); if (day < 14) return day + 'd'
  const wk = Math.round(day / 7); if (wk < 53) return wk + 'w'
  return Math.round(day / 365) + 'y'
}

const KITTY_A = [
  '#.......#.#.',
  '#......#####',
  '.##########.',
  '..########..',
  '..#.#..#.#..',
]
const KITTY_B = [
  '.#......#.#.',
  '#.....######',
  '.##########.',
  '..########..',
  '...#.#..#.#.',
]
function kittySvg(frame: 'a' | 'b'): string {
  const grid = frame === 'a' ? KITTY_A : KITTY_B
  let rects = ''
  grid.forEach((line, y) => { for (let x = 0; x < line.length; x++) if (line[x] === '#') rects += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>' })
  return '<svg class="wr-kf wr-kf-' + frame + '" viewBox="0 0 12 5" width="24" height="10" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">' + rects + '</svg>'
}

/** The collapsible rail panel itself. */
export class RailPanel {
  private panel: HTMLElement | null = null
  private drawer: HTMLElement | null = null
  private drawerState: DrawerState | null = null
  private list: VirtualList | null = null
  private recentsBox: HTMLElement | null = null
  private readonly deps: RailPanelDeps
  private readonly doc: Document
  private unsubscribe: (() => void) | null = null
  private openMenuKey: string | null = null
  private pinnedFormOpen = false
  private projectFormOpen = false
  private filterQ = ''
  private configOpen = false
  private resultsBox: HTMLElement | null = null
  private recentsSection: HTMLElement | null = null
  private toast: { text: string; undo?: () => void; timer?: ReturnType<typeof setTimeout> } | null = null
  /** Project view: the "add chats" picker and its query. */
  private addChatsOpen = false
  private addChatsQ = ''
  private dropActive = false
  /** Row being dragged for reorder (Pinned / Projects), or null. */
  private drag: { group: 'pinned' | 'projects'; key: string } | null = null
  private dropMarkEl: HTMLElement | null = null
  private renderDeferred = false
  private dragTouched = 0
  private binOpen = false
  private binConfirm: string | null = null
  /** Project view: the instructions editor is open. */
  private editingInstructions = false
  private uploading = 0
  /** Loaded model catalog (null until fetched). */
  private catalog: ModelGroup[] | null = null
  private catalogLoading = false
  /** Projects list: show the archived ones. */
  private showArchived = false
  /** Project view: the delete confirmation is open. */
  private confirmDelete = false
  private deleteFiles = false
  private resizeObs: ResizeObserver | null = null
  /** The chat being renamed inline; survives re-renders (the list redraws on every host update). */
  private renaming: RenameState | null = null
  private renameInput: HTMLInputElement | null = null
  /** Optimistic titles shown until the host's list reports the accepted one. */
  private readonly pendingTitles = new Map<string, string>()

  constructor(deps: RailPanelDeps, doc: Document = document) {
    this.deps = deps
    this.doc = doc
    ensureStyle(doc)
    this.unsubscribe = deps.store.subscribe(() => this.render())
  }

  /** The fixed launcher chip. */
  mountLauncher(host: HTMLElement = this.doc.body): HTMLElement {
    const chip = this.doc.createElement('div')
    chip.className = LAUNCHER_CLASS
    chip.textContent = '\u25a4 Rail'
    chip.addEventListener('click', () => this.toggle())
    host.appendChild(chip)
    return chip
  }

  get isOpen(): boolean { return this.panel !== null }

  /**
   * Open the rail. With a `host` it is embedded (part of the layout: the
   * sidebar seat); without one it falls back to the legacy floating panel.
   */
  open(host?: HTMLElement): void {
    if (this.panel !== null) return
    const panel = this.doc.createElement('div')
    panel.className = PANEL_CLASS + (host !== undefined ? ' wr-embedded' : ' wr-floating')
    ;(host ?? this.doc.body).appendChild(panel)
    this.panel = panel
    // Watchdog: mouse-move events do not fire during a native drag, so seeing
    // one means the drag is over even if dragend never arrived.
    panel.addEventListener('mousemove', () => { if (this.drag !== null && Date.now() - this.dragTouched > 300) this.endDrag() }, true)
    this.render()
  }

  close(): void {
    if (this.panel === null) return
    this.panel.remove()
    this.panel = null
    this.list?.destroy()
    this.list = null
    this.recentsBox = null
    this.resizeObs?.disconnect()
    this.resizeObs = null
    this.closeDrawer()
  }

  toggle(): void { if (this.isOpen) this.close(); else this.open() }

  /** (Re)render the panel content. */
  render(): void {
    if (this.panel === null) return
    // A redraw destroys the DOM under a drag or a scroll in flight (killing the
    // gesture / trackpad momentum): park it and redraw once things settle.
    // A drag that stopped reporting (dragend lost) must never freeze the rail.
    if (this.drag !== null && Date.now() - this.dragTouched > 1500) this.drag = null
    if (this.drag !== null || this.list?.scrolling === true) {
      if (!this.renderDeferred) {
        this.renderDeferred = true
        setTimeout(() => this.flushDeferredRender(), this.drag === null ? 280 : 1600)
      }
      return
    }
    this.renderDeferred = false
    const state: RailState = this.deps.store.getSnapshot()
    const panel = this.panel
    this.settlePendingTitles()
    const keep = this.captureView(panel)
    panel.replaceChildren()
    panel.classList.toggle('edge-right', state.stripeEdge === 'right')
    panel.classList.toggle('edge-left', state.stripeEdge === 'left')

    // Header: Rail | Folders switch, then graded search + settings.
    const head = this.doc.createElement('div')
    head.className = 'wr-head'
    if (this.deps.onSwitchView !== undefined) {
      const seg = this.doc.createElement('div')
      seg.className = 'wr-seg'
      seg.setAttribute('role', 'group')
      seg.setAttribute('aria-label', 'Sidebar view')
      const railBtn = this.doc.createElement('button')
      railBtn.textContent = 'Rail'
      railBtn.setAttribute('aria-pressed', 'true')
      const foldersBtn = this.doc.createElement('button')
      foldersBtn.textContent = 'Folders'
      foldersBtn.setAttribute('aria-pressed', 'false')
      foldersBtn.title = 'Show the folder view (metafolder)'
      foldersBtn.addEventListener('click', () => this.deps.onSwitchView?.())
      seg.appendChild(railBtn)
      seg.appendChild(foldersBtn)
      head.appendChild(seg)
    }
    const searchRow = this.doc.createElement('div')
    searchRow.className = 'wr-searchrow'
    const search = this.doc.createElement('label')
    search.className = 'wr-search'
    search.innerHTML = SEARCH_SVG
    const filter = this.doc.createElement('input')
    filter.dataset.keep = 'search'
    filter.placeholder = 'Search chats'
    filter.value = this.filterQ
    filter.setAttribute('aria-label', 'Search chats')
    filter.addEventListener('input', () => { this.filterQ = filter.value; this.applyFilterView() })
    filter.addEventListener('keydown', ev => { if (ev.key === 'Escape') { this.filterQ = ''; filter.value = ''; this.applyFilterView() } })
    search.appendChild(filter)
    const gear = this.doc.createElement('button')
    gear.className = 'wr-iconbtn'
    gear.innerHTML = GEAR_SVG
    gear.title = 'Rail settings'
    gear.setAttribute('aria-pressed', String(this.configOpen))
    gear.addEventListener('click', ev => { ev.stopPropagation(); this.configOpen = !this.configOpen; this.render() })
    searchRow.appendChild(search)
    searchRow.appendChild(gear)
    head.appendChild(searchRow)
    panel.appendChild(head)

    if (this.configOpen) panel.appendChild(this.renderConfig(state))

    const body = this.doc.createElement('div')
    body.className = 'wr-body'
    body.dataset.keep = 'body'
    panel.appendChild(body)

    body.appendChild(this.renderPinned(state))
    body.appendChild(this.renderProjects(state))
    const results = this.doc.createElement('div')
    results.className = 'wr-results'
    this.resultsBox = results
    body.appendChild(results)
    this.recentsSection = this.renderRecents(state)
    body.appendChild(this.recentsSection)
    this.applyFilterView()
    panel.appendChild(this.renderFooter(state))
    if (this.drawerState !== null) this.renderDrawer()
    if (this.binOpen) panel.appendChild(this.renderBinDrawer())
    if (this.toast !== null) panel.appendChild(this.renderToast())
    this.restoreView(panel, keep)
  }

  private flushDeferredRender(): void {
    if (!this.renderDeferred) return
    if (this.drag !== null && Date.now() - this.dragTouched > 1500) this.drag = null
    if (this.drag !== null) { setTimeout(() => this.flushDeferredRender(), 800); return }
    if (this.list?.scrolling === true) { setTimeout(() => this.flushDeferredRender(), 280); return }
    this.render()
  }

  // ---- Bin ---------------------------------------------------------------

  /** Hide a chat everywhere in the rail (reversible); memberships and pins are kept for a restore. */
  private binChat(id: string): void {
    const title = this.deps.sessionTitle(id)
    this.openMenuKey = null
    this.mutate(d => { d.binned[id] = Date.now() })
    this.showToast('Moved \u201c' + title + '\u201d to the bin', () => this.restoreChat(id))
  }

  private restoreChat(id: string): void {
    this.mutate(d => { delete d.binned[id] })
  }

  private renderBinDrawer(): HTMLElement {
    const drawer = this.doc.createElement('div')
    drawer.className = 'wr-drawer wr-bindrawer'
    const head = this.doc.createElement('div')
    head.className = 'wr-dhead'
    const back = this.doc.createElement('button')
    back.className = 'wr-dclose'
    back.textContent = '\u2190'
    back.title = 'Back to the rail'
    back.setAttribute('aria-label', 'Back to the rail')
    back.addEventListener('click', () => { this.binOpen = false; this.binConfirm = null; this.render() })
    const title = this.doc.createElement('span')
    title.className = 'wr-ptitle'
    title.textContent = 'Bin'
    head.appendChild(back)
    head.appendChild(title)
    const items = this.deps.binned?.() ?? []
    if (items.length > 0 && this.deps.deleteForever !== undefined) {
      const empty = this.doc.createElement('button')
      empty.className = 'wr-pbtn' + (this.binConfirm === '*' ? ' wr-pbtn-danger' : '')
      empty.textContent = this.binConfirm === '*' ? 'Really delete all?' : 'Empty bin'
      empty.addEventListener('click', () => {
        if (this.binConfirm !== '*') { this.binConfirm = '*'; this.render(); return }
        this.binConfirm = null
        for (const it of items) void this.deps.deleteForever!(it.id)
        this.showToast('Deleted ' + items.length + (items.length === 1 ? ' chat' : ' chats'))
      })
      head.appendChild(empty)
    }
    drawer.appendChild(head)
    const body = this.doc.createElement('div')
    body.className = 'wr-dbody'
    body.dataset.keep = 'bin-body'
    drawer.appendChild(body)
    if (items.length === 0) {
      const none = this.doc.createElement('div')
      none.className = 'wr-empty'
      none.textContent = 'The bin is empty. Use \u22ef \u2192 Move to bin on any chat.'
      body.appendChild(none)
    } else {
      const hint = this.doc.createElement('div')
      hint.className = 'wr-phint'
      hint.textContent = 'Binned chats are hidden in the rail and searches. Restore brings them back where they were. Delete forever hides them everywhere in DSH; the transcript stays on disk.'
      body.appendChild(hint)
    }
    for (const it of items) {
      const row = this.doc.createElement('div')
      row.className = 'wr-row wr-binrow'
      const t = this.doc.createElement('span')
      t.className = 'wr-title'
      t.textContent = it.title
      t.title = it.title
      row.appendChild(t)
      const age = relativeAge(it.at)
      if (age.length > 0) {
        const time = this.doc.createElement('span')
        time.className = 'wr-time'
        time.textContent = age
        row.appendChild(time)
      }
      const restore = this.doc.createElement('button')
      restore.className = 'wr-binact'
      restore.textContent = 'Restore'
      restore.addEventListener('click', ev => { ev.stopPropagation(); this.restoreChat(it.id) })
      row.appendChild(restore)
      if (this.deps.deleteForever !== undefined) {
        const del = this.doc.createElement('button')
        del.className = 'wr-binact wr-bindel'
        const armed = this.binConfirm === it.id
        del.textContent = armed ? 'Sure?' : '\u2715'
        del.title = 'Delete forever'
        del.addEventListener('click', ev => {
          ev.stopPropagation()
          if (!armed) { this.binConfirm = it.id; this.render(); return }
          this.binConfirm = null
          void this.deps.deleteForever!(it.id).then(ok => { if (!ok) this.showToast('Could not delete that chat') })
        })
        row.appendChild(del)
      }
      body.appendChild(row)
    }
    return drawer
  }

  // ---- Working indicator ---------------------------------------------------

  /** Blue dot for a row holding an unread reply; null when there is none. */
  private unreadMark(unread: boolean, label = 'Unread reply'): HTMLElement | null {
    if (!unread) return null
    const el = this.doc.createElement('span')
    el.className = 'wr-unread'
    el.setAttribute('role', 'img')
    el.setAttribute('aria-label', label)
    el.title = label
    return el
  }

  /** Any chat filed in this folder or one of its subfolders is unread. */
  private folderHasUnread(state: RailState, folderId: string): boolean {
    if (this.deps.isUnread === undefined) return false
    const inside = (fid: string | null | undefined): boolean => {
      for (let f = fid, guard = 0; f != null && guard < 32; f = state.folders[f]?.parentId, guard++) if (f === folderId) return true
      return false
    }
    return Object.entries(state.sessionFolders).some(([sid, fid]) => inside(fid) && this.deps.isUnread!(sid))
  }

  /** A pixel kitty (or dots) for a chat that is working; null when idle or switched off. */
  private workingBadge(running: boolean): HTMLElement | null {
    if (!running) return null
    const mode = this.deps.store.getSnapshot().workingIndicator
    if (mode === 'off') return null
    const el = this.doc.createElement('span')
    el.setAttribute('role', 'img')
    el.setAttribute('aria-label', 'Working')
    el.title = 'Working\u2026'
    if (mode === 'dots') {
      el.className = 'wr-working wr-dots3'
      el.innerHTML = '<i></i><i></i><i></i>'
    } else {
      el.className = 'wr-working wr-kitty'
      el.innerHTML = kittySvg('a') + kittySvg('b')
    }
    return el
  }

  // ---- Drag-and-drop reorder (Pinned + Projects) --------------------------

  private clearDropMark(): void {
    if (this.dropMarkEl !== null) this.dropMarkEl.classList.remove('wr-drop-before', 'wr-drop-after', 'wr-drop-into', 'wr-drop-end')
    this.dropMarkEl = null
  }

  private endDrag(): void {
    this.clearDropMark()
    this.panel?.querySelectorAll('.wr-dragsrc').forEach(n => n.classList.remove('wr-dragsrc'))
    this.drag = null
    if (this.renderDeferred) this.flushDeferredRender()
  }

  /**
   * Make a row draggable for reorder. `mode(fromKey)` says what dropping the
   * dragged row here means: 'reorder' (before/after by cursor half), 'into'
   * (the whole row is a target) or null (refuse).
   */
  private makeSortable(el: HTMLElement, group: 'pinned' | 'projects', key: string,
    mode: (from: string) => 'reorder' | 'into' | null,
    onDrop: (from: string, pos: 'before' | 'after' | 'into') => void): void {
    el.draggable = true
    el.addEventListener('dragstart', ev => {
      const t = ev.target as HTMLElement
      if (ev.dataTransfer === null || t.closest('input,textarea') !== null) { ev.preventDefault(); return }
      this.drag = { group, key }
      this.dragTouched = Date.now()
      ev.dataTransfer.effectAllowed = 'move'
      // Custom type only: a text/plain payload would be taken by the project
      // drawer's file/URL drop zone.
      ev.dataTransfer.setData('application/x-wr-row', group + '|' + key)
      setTimeout(() => el.classList.add('wr-dragsrc'), 0)
    })
    el.addEventListener('dragend', () => this.endDrag())
    const position = (ev: DragEvent, m: 'reorder' | 'into'): 'before' | 'after' | 'into' => {
      if (m === 'into') return 'into'
      const r = el.getBoundingClientRect()
      return ev.clientY < r.top + r.height / 2 ? 'before' : 'after'
    }
    el.addEventListener('dragover', ev => {
      const d = this.drag
      if (d !== null) this.dragTouched = Date.now()
      if (d === null || d.group !== group || d.key === key) return
      const m = mode(d.key)
      if (m === null) return
      ev.preventDefault()
      if (ev.dataTransfer !== null) ev.dataTransfer.dropEffect = 'move'
      const pos = position(ev, m)
      if (this.dropMarkEl !== el) this.clearDropMark()
      this.dropMarkEl = el
      el.classList.toggle('wr-drop-before', pos === 'before')
      el.classList.toggle('wr-drop-after', pos === 'after')
      el.classList.toggle('wr-drop-into', pos === 'into')
    })
    el.addEventListener('dragleave', ev => {
      if (!el.contains(ev.relatedTarget as Node | null)) { el.classList.remove('wr-drop-before', 'wr-drop-after', 'wr-drop-into'); if (this.dropMarkEl === el) this.dropMarkEl = null }
    })
    el.addEventListener('drop', ev => {
      const d = this.drag
      if (d === null || d.group !== group || d.key === key) return
      const m = mode(d.key)
      if (m === null) return
      ev.preventDefault()
      ev.stopPropagation()
      const pos = position(ev, m)
      const from = d.key
      this.endDrag()
      onDrop(from, pos)
    })
  }

  /** Scroll a section list while a row is dragged near its top/bottom edge. */
  private autoScrollOnDrag(list: HTMLElement): void {
    list.addEventListener('dragover', ev => {
      if (this.drag === null) return
      const r = list.getBoundingClientRect()
      const edge = 18
      if (ev.clientY < r.top + edge) list.scrollTop -= 10
      else if (ev.clientY > r.bottom - edge) list.scrollTop += 10
    })
  }

  /**
   * Remember what a redraw would destroy - the focused field (value, caret)
   * and every scroll position - keyed by stable data-keep attributes.
   */
  private captureView(panel: HTMLElement): { focus: { key: string; value: string; s: number | null; e: number | null } | null; focusKey: string | null; scroll: Map<string, number> } {
    const scroll = new Map<string, number>()
    panel.querySelectorAll<HTMLElement>('[data-keep]').forEach(el => { if (el.scrollTop > 0) scroll.set(el.dataset.keep!, el.scrollTop) })
    const a = this.doc.activeElement
    let focus: { key: string; value: string; s: number | null; e: number | null } | null = null
    if ((a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement) && panel.contains(a) && a.dataset.keep !== undefined) {
      focus = { key: a.dataset.keep, value: a.value, s: a.selectionStart, e: a.selectionEnd }
    }
    // A focused control (e.g. a section button pressed from the keyboard) keeps focus across the redraw.
    const focusKey = a instanceof HTMLElement && panel.contains(a) && a.dataset.focusKey !== undefined ? a.dataset.focusKey : null
    return { focus, focusKey, scroll }
  }

  private restoreView(panel: HTMLElement, keep: ReturnType<RailPanel['captureView']>): void {
    const byKey = new Map<string, HTMLElement>()
    panel.querySelectorAll<HTMLElement>('[data-keep]').forEach(el => { if (!byKey.has(el.dataset.keep!)) byKey.set(el.dataset.keep!, el) })
    for (const [key, top] of keep.scroll) {
      const el = byKey.get(key)
      if (el !== undefined) el.scrollTop = top
    }
    if (keep.focusKey !== null) {
      const btn = [...panel.querySelectorAll<HTMLElement>('[data-focus-key]')].find(el => el.dataset.focusKey === keep.focusKey)
      if (btn !== undefined && this.doc.activeElement !== btn) btn.focus()
    }
    const f = keep.focus
    if (f === null) return
    const el = byKey.get(f.key)
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return
    if (el.value !== f.value) el.value = f.value
    el.focus()
    try { if (f.s !== null && f.e !== null) el.setSelectionRange(f.s, f.e) } catch { /* not a text field */ }
  }


  /** Footer: global default workspace entry + settings toggle (spec §4). */
  private renderFooter(state: RailState): HTMLElement {
    const footer = this.doc.createElement('div')
    footer.className = 'wr-footer'
    const globalCount = this.deps.recents().filter(r => r.repeat !== 'project').length
    const global = this.doc.createElement('span')
    global.textContent = globalCount + ' chats'
    global.title = 'Fallback workspace for chats outside any project'
    const settings = this.doc.createElement('button')
    settings.className = 'wr-dots'
    settings.textContent = this.configOpen ? 'Close settings' : 'Settings'
    settings.addEventListener('click', () => { this.configOpen = !this.configOpen; this.render() })
    footer.appendChild(global)
    const binCount = this.deps.binned?.().length ?? 0
    if (this.deps.binned !== undefined) {
      const bin = this.doc.createElement('button')
      bin.className = 'wr-dots wr-binbtn'
      bin.textContent = binCount > 0 ? 'Bin ' + binCount : 'Bin'
      bin.title = 'Chats you moved to the bin'
      bin.addEventListener('click', () => { this.binOpen = true; this.binConfirm = null; this.render() })
      footer.appendChild(bin)
    }
    footer.appendChild(settings)
    return footer
  }

  /**
   * Show ranked search hits while a query is present (Recents hidden -
   * one surface at a time); restore the feed when the query clears.
   */
  private applyFilterView(): void {
    const query = this.filterQ.trim()
    if (this.resultsBox === null || this.recentsSection === null) return
    if (query.length === 0) {
      this.resultsBox.replaceChildren()
      this.recentsSection.style.display = ''
      return
    }
    this.recentsSection.style.display = 'none'
    this.resultsBox.replaceChildren()
    const label = this.doc.createElement('div')
    label.className = 'wr-label'
    label.textContent = 'Results'
    this.resultsBox.appendChild(label)
    const hits = this.deps.search(query)
    if (hits.length === 0) {
      const empty = this.doc.createElement('div')
      empty.className = 'wr-empty'
      empty.textContent = 'No matches in titles, docs, or transcript windows'
      this.resultsBox.appendChild(empty)
      return
    }
    for (const hit of hits) {
      const row = this.doc.createElement('div')
      row.className = 'wr-row'
      const tier = this.doc.createElement('span')
      tier.className = 'wr-tier'
      tier.textContent = 'T' + String(hit.tier)
      tier.title = 'Match tier (1 = title/folder/project, 2 = docs/tags, 3 = first messages, 4 = last messages)'
      const title = this.doc.createElement('span')
      title.className = 'wr-title'
      title.textContent = hit.title
      title.title = hit.title
      const score = this.doc.createElement('span')
      score.className = 'wr-badge'
      score.textContent = hit.score.toFixed(1)
      row.appendChild(tier)
      row.appendChild(title)
      row.appendChild(score)
      row.addEventListener('click', () => this.deps.openSession?.(hit.id))
      this.resultsBox.appendChild(row)
    }
    // Indexing is progressive: nudge the host bridge while results are thin.
    if (hits.length < 3) this.deps.requestWindows?.()
  }
  // ---- Pinned -----------------------------------------------------------

  private renderPinned(state: RailState): HTMLElement {
    const rows = buildPinnedRows(state, id => this.deps.sessionTitle(id))
      .filter(r => r.kind !== 'session' || this.deps.isHidden?.(r.id) !== true)
    const { section, labelRow, list } = this.sectionShell(state, 'pinned', 'Pinned', rows.length)
    const add = this.doc.createElement('button')
    add.className = 'wr-add'
    add.textContent = '+'
    add.title = 'New folder'
    add.addEventListener('click', () => { this.pinnedFormOpen = !this.pinnedFormOpen; this.projectFormOpen = false; this.render() })
    labelRow.appendChild(add)
    if (this.isCollapsed(state, 'pinned')) return section

    if (this.pinnedFormOpen) section.insertBefore(this.renderFolderForm(), list)
    if (rows.length === 0) {
      const empty = this.doc.createElement('div')
      empty.className = 'wr-empty'
      empty.textContent = 'Pin chats from Recents with \u22ef'
      list.appendChild(empty)
      return section
    }
    for (const row of rows) list.appendChild(this.renderPinnedRow(state, row))
    this.autoScrollOnDrag(list)
    // Empty space below the rows: drop a chat here to make it standalone, last.
    const dropEnd = (target: HTMLElement): void => {
      target.addEventListener('dragover', ev => {
        if (this.drag === null || this.drag.group !== 'pinned' || !this.drag.key.startsWith('S:')) return
        if (ev.target !== target) return
        ev.preventDefault()
        if (this.dropMarkEl !== list) this.clearDropMark()
        this.dropMarkEl = list
        list.classList.add('wr-drop-end')
      })
      target.addEventListener('dragleave', ev => { if (ev.target === target) list.classList.remove('wr-drop-end') })
      target.addEventListener('drop', ev => {
        if (this.drag === null || this.drag.group !== 'pinned' || !this.drag.key.startsWith('S:')) return
        ev.preventDefault()
        const sid = this.drag.key.slice(2)
        this.endDrag()
        this.mutate(d => Object.assign(d, movePinnedSession(d, sid, { kind: 'end' })))
      })
    }
    dropEnd(list)
    return section
  }

  private renderFolderForm(): HTMLElement {
    const form = this.doc.createElement('div')
    form.className = 'wr-form'
    const name = this.doc.createElement('input')
    name.placeholder = 'Folder name'
    const kindSel = this.doc.createElement('select')
    kindSel.appendChild(this.option('pixel', 'Pixel icon'))
    kindSel.appendChild(this.option('emoji', 'Emoji'))
    const variantSel = this.doc.createElement('select')
    for (const v of PIXEL_VARIANTS) variantSel.appendChild(this.option(v, v))
    const toneSel = this.doc.createElement('select')
    toneSel.appendChild(this.option('black', 'Black'))
    toneSel.appendChild(this.option('white', 'White'))
    const emoji = this.doc.createElement('input')
    emoji.placeholder = '\ud83d\udce6'
    emoji.maxLength = 4
    const go = this.doc.createElement('button')
    go.className = 'wr-go'
    go.textContent = 'Create'
    const submit = (): void => {
      const iconKind = kindSel.value === 'emoji' ? 'emoji' : 'pixel'
      this.mutate(d => Object.assign(d, createFolder(d, {
        name: name.value,
        iconKind,
        iconValue: iconKind === 'emoji' ? (emoji.value.trim() === '' ? '\ud83d\udce6' : emoji.value.trim()) : variantSel.value,
        iconTone: toneSel.value === 'white' ? 'white' : 'black',
      })))
      this.pinnedFormOpen = false
    }
    go.addEventListener('click', submit)
    name.addEventListener('keydown', ev => { if (ev.key === 'Enter') submit() })
    form.appendChild(name)
    form.appendChild(kindSel)
    form.appendChild(variantSel)
    form.appendChild(toneSel)
    form.appendChild(emoji)
    form.appendChild(go)
    return form
  }

  private renderPinnedRow(state: RailState, row: ReturnType<typeof buildPinnedRows>[number]): HTMLElement {
    const el = this.doc.createElement('div')
    el.className = 'wr-row'
    el.dataset.rowKey = (row.kind === 'folder' ? 'F:' : 'S:') + row.id
    if (row.indent === 1) el.style.paddingLeft = '28px'

    // Icon: pixel SVG, emoji, or a bullet for standalone chats.
    const icon = this.doc.createElement('span')
    icon.className = 'wr-icon'
    if (row.kind === 'folder') {
      const folder = state.folders[row.id]
      if (folder !== undefined && folder.iconKind === 'emoji') icon.textContent = folder.iconValue
      else if (folder !== undefined) icon.innerHTML = pixelIconSvg(folder.iconValue, folder.iconTone)
    } else {
      icon.textContent = '\u2022'
    }
    el.appendChild(icon)

    if (row.kind === 'folder') {
      const title = this.doc.createElement('span')
      title.className = 'wr-title'
      title.textContent = row.name
      title.title = row.name
      el.appendChild(title)
    } else {
      el.appendChild(this.chatTitle(row.id, row.name))
    }
    // Unread: the chat itself, or (folded folder) any chat inside it.
    const unreadMark = row.kind === 'session'
      ? this.unreadMark(this.deps.isUnread?.(row.id) === true)
      : this.unreadMark(row.collapsed === true && this.folderHasUnread(state, row.id), 'Unread reply inside')
    if (unreadMark !== null) el.appendChild(unreadMark)

    if (row.kind === 'folder') {
      el.addEventListener('click', ev => {
        if ((ev.target as HTMLElement).closest('.wr-dots,.wr-menu') !== null) return
        this.mutate(d => Object.assign(d, toggleFolderCollapsed(d, row.id)))
      })
    } else {
      if (this.deps.currentId?.() === row.id) el.classList.add('wr-current')
      el.addEventListener('click', ev => {
        if ((ev.target as HTMLElement).closest('.wr-dots,.wr-menu,.wr-rename') !== null || ev.detail > 1) return
        this.deps.openSession?.(row.id)
      })
    }

    if (row.kind === 'session') {
      const working = this.workingBadge(this.deps.isRunning?.(row.id) === true)
      if (working !== null) { el.classList.add('wr-isworking'); el.appendChild(working) }
    }
    const stripeHue = state.stripes[row.id]
    if (stripeHue !== undefined) {
      const stripe = this.doc.createElement('span')
      stripe.className = 'wr-stripe'
      stripe.style.background = stripeColor(stripeHue)
      el.appendChild(stripe)
    }

    if (row.kind === 'folder') {
      this.makeSortable(el, 'pinned', 'F:' + row.id,
        from => {
          if (from.startsWith('S:')) return 'into'
          const f = this.deps.store.getSnapshot().folders[from.slice(2)]
          const t = this.deps.store.getSnapshot().folders[row.id]
          return f !== undefined && t !== undefined && f.parentId === t.parentId ? 'reorder' : null
        },
        (from, pos) => {
          if (from.startsWith('S:')) this.mutate(d => Object.assign(d, movePinnedSession(d, from.slice(2), { kind: 'folder', id: row.id })))
          else this.mutate(d => { d.folderOrder = moveFolder(d, from.slice(2), row.id, pos === 'after') })
        })
    } else {
      this.makeSortable(el, 'pinned', 'S:' + row.id,
        from => (from.startsWith('S:') ? 'reorder' : null),
        (from, pos) => this.mutate(d => Object.assign(d, movePinnedSession(d, from.slice(2), { kind: 'session', id: row.id, after: pos === 'after' }))))
    }

    const menuKey = 'P:' + row.id
    el.appendChild(this.dotsButton(menuKey))
    if (this.openMenuKey === menuKey) el.appendChild(this.menuEl(menuKey, this.pinnedMenuItems(state, row)))
    return el
  }

  private pinnedMenuItems(state: RailState, row: ReturnType<typeof buildPinnedRows>[number]): MenuItem[] {
    if (row.kind === 'folder') {
      return [
        { label: row.collapsed === true ? 'Expand' : 'Collapse', action: () => this.mutate(d => Object.assign(d, toggleFolderCollapsed(d, row.id))) },
        { label: 'Stripe color', action: () => {}, swatchFor: row.id },
        { label: 'Delete folder', action: () => this.mutate(d => Object.assign(d, deleteFolder(d, row.id))) },
      ]
    }
    const items: MenuItem[] = [
      { label: 'Rename', action: () => this.startRename(row.id, row.name) },
      { label: 'Unpin', action: () => this.mutate(d => Object.assign(d, unpinSession(d, row.id))) },
    ]
    if (row.folderId != null) items.push({ label: 'Remove from folder', action: () => this.mutate(d => Object.assign(d, assignSessionFolder(d, row.id, null))) })
    items.push({ label: 'Stripe color', action: () => {}, swatchFor: row.id })
    items.push({ label: 'Move to bin', action: () => this.binChat(row.id) })
    return items
  }

  /** Rail settings: stripe edge + per-project auto-carryover pointer. */
  private renderConfig(state: RailState): HTMLElement {
    const section = this.doc.createElement('div')
    section.className = 'wr-config'
    const line = (label: string, control: HTMLElement): void => {
      const row = this.doc.createElement('div')
      row.className = 'wr-cfgrow'
      const l = this.doc.createElement('span')
      l.className = 'wr-cfglabel'
      l.textContent = label
      row.appendChild(l)
      row.appendChild(control)
      section.appendChild(row)
    }
    // Stripe edge: a real dropdown, visibly one (chevron), aligned with its label.
    const selWrap = this.doc.createElement('span')
    selWrap.className = 'wr-select'
    const edgeSel = this.doc.createElement('select')
    edgeSel.appendChild(this.option('right', 'Right'))
    edgeSel.appendChild(this.option('left', 'Left'))
    edgeSel.value = state.stripeEdge
    edgeSel.addEventListener('change', () => this.mutate(d => { d.stripeEdge = edgeSel.value === 'left' ? 'left' : 'right' }))
    selWrap.appendChild(edgeSel)
    line('Stripe edge', selWrap)
    const wWrap = this.doc.createElement('span')
    wWrap.className = 'wr-select'
    const wSel = this.doc.createElement('select')
    wSel.appendChild(this.option('kitty', 'Kitty'))
    wSel.appendChild(this.option('dots', 'Dots'))
    wSel.appendChild(this.option('off', 'Off'))
    wSel.value = state.workingIndicator
    wSel.addEventListener('change', () => this.mutate(d => { d.workingIndicator = wSel.value === 'dots' || wSel.value === 'off' ? wSel.value : 'kitty' }))
    wWrap.appendChild(wSel)
    line('Working chats', wWrap)
    // Browser tab: rail icon + live title (unread, working kitty, last message).
    const tWrap = this.doc.createElement('span')
    tWrap.className = 'wr-select'
    const tSel = this.doc.createElement('select') as HTMLSelectElement
    tSel.appendChild(this.option('on', 'Live'))
    tSel.appendChild(this.option('off', 'Off'))
    tSel.value = state.tabTitle ? 'on' : 'off'
    tSel.title = 'Live: rail icon, unread count, working kitty, last message. Off: the default tab title and icon.'
    tSel.addEventListener('change', () => this.mutate(d => { d.tabTitle = tSel.value !== 'off' }))
    tWrap.appendChild(tSel)
    line('Browser tab', tWrap)
    for (const [key, label] of [['pinned', 'Pinned rows'], ['projects', 'Project rows']] as const) {
      const step = this.doc.createElement('span')
      step.className = 'wr-stepper'
      const minus = this.doc.createElement('button')
      minus.textContent = '−'
      minus.setAttribute('aria-label', 'Fewer ' + label.toLowerCase())
      const val = this.doc.createElement('span')
      val.className = 'wr-stepval'
      val.textContent = String(state.sectionRows[key])
      const plus = this.doc.createElement('button')
      plus.textContent = '+'
      plus.setAttribute('aria-label', 'More ' + label.toLowerCase())
      const set = (delta: number): void => this.mutate(d => {
        d.sectionRows = { ...d.sectionRows, [key]: Math.min(30, Math.max(1, d.sectionRows[key] + delta)) }
      })
      minus.addEventListener('click', () => set(-1))
      plus.addEventListener('click', () => set(1))
      step.appendChild(minus)
      step.appendChild(val)
      step.appendChild(plus)
      line(label, step)
    }
    const hint = this.doc.createElement('div')
    hint.className = 'wr-phint'
    hint.textContent = 'Recents fills the rest. You can also drag the line under a section.'
    section.appendChild(hint)
    return section
  }


  private renderProjects(state: RailState): HTMLElement {
    const { section, labelRow, list } = this.sectionShell(state, 'projects', 'Projects', state.projectOrder.filter(id => state.projects[id]?.archived !== true).length)
    const add = this.doc.createElement('button')
    add.className = 'wr-add'
    add.textContent = '+'
    add.title = 'New project'
    add.addEventListener('click', () => { this.projectFormOpen = !this.projectFormOpen; this.pinnedFormOpen = false; this.render() })
    labelRow.appendChild(add)
    if (this.isCollapsed(state, 'projects')) return section

    if (this.projectFormOpen) {
      const form = this.doc.createElement('div')
      form.className = 'wr-form'
      const name = this.doc.createElement('input')
      name.placeholder = 'Project name'
      const go = this.doc.createElement('button')
      go.className = 'wr-go'
      go.textContent = 'Create'
      const submit = (): void => { this.mutate(d => Object.assign(d, createProject(d, name.value))); this.projectFormOpen = false }
      go.addEventListener('click', submit)
      name.addEventListener('keydown', ev => { if (ev.key === 'Enter') submit() })
      form.appendChild(name)
      form.appendChild(go)
      section.insertBefore(form, list)
      setTimeout(() => { if (name.isConnected) name.focus() }, 0)
    }

    if (state.projectOrder.length === 0) {
      const empty = this.doc.createElement('div')
      empty.className = 'wr-empty'
      empty.textContent = 'No projects yet'
      list.appendChild(empty)
      return section
    }
    this.autoScrollOnDrag(list)
    const archived: string[] = []
    for (const pid of state.projectOrder) {
      const p = state.projects[pid]
      if (p === undefined) continue
      if (p.archived === true) { archived.push(pid); continue }
      list.appendChild(this.renderProjectRow(state, pid))
    }
    if (archived.length > 0) {
      const toggle = this.doc.createElement('button')
      toggle.className = 'wr-archtoggle'
      toggle.textContent = (this.showArchived ? '\u25be ' : '\u25b8 ') + 'Archived (' + archived.length + ')'
      toggle.addEventListener('click', () => { this.showArchived = !this.showArchived; this.render() })
      list.appendChild(toggle)
      if (this.showArchived) for (const pid of archived) {
        const row = this.renderProjectRow(state, pid)
        row.classList.add('wr-archived')
        list.appendChild(row)
      }
    }
    return section
  }

  // ---- Section chrome: fixed header, own scroll list, drag-to-resize ----------

  private isCollapsed(state: RailState, key: SectionKey): boolean {
    return sectionView(state, key).folded
  }

  private isExpanded(state: RailState, key: SectionKey): boolean {
    return sectionView(state, key).expanded
  }

  /**
   * Header row: expand button, then chevron + label + count. The chevron folds
   * the section (hides its body); the expand button makes it fill the sidebar
   * (the other sections show only their headers) until it is pressed again.
   */
  private sectionHeader(state: RailState, key: SectionKey, text: string, count: number | null): HTMLElement {
    const labelRow = this.doc.createElement('div')
    labelRow.className = 'wr-label'
    const expanded = this.isExpanded(state, key)
    const expand = this.doc.createElement('button')
    expand.type = 'button'
    expand.className = 'wr-expand'
    expand.dataset.focusKey = 'expand:' + key
    expand.innerHTML = expanded ? COLLAPSE_SVG : EXPAND_SVG
    const expandName = expanded ? 'Collapse section' : 'Expand section'
    expand.title = expandName
    expand.setAttribute('aria-label', expandName)
    expand.setAttribute('aria-expanded', String(expanded))
    expand.addEventListener('click', ev => { ev.stopPropagation(); this.mutate(d => { d.expandedSection = toggleExpanded(d, key).expandedSection }) })
    labelRow.appendChild(expand)
    const toggle = this.doc.createElement('button')
    toggle.type = 'button'
    toggle.className = 'wr-fold'
    toggle.dataset.focusKey = 'fold:' + key
    const folded = this.isCollapsed(state, key)
    toggle.setAttribute('aria-expanded', String(!folded))
    toggle.title = folded ? 'Show ' + text : 'Hide ' + text
    const chev = this.doc.createElement('span')
    chev.className = 'wr-chev'
    chev.textContent = '\u25be'
    toggle.appendChild(chev)
    toggle.appendChild(this.doc.createTextNode(text))
    if (count !== null && count > 0) {
      const c = this.doc.createElement('span')
      c.className = 'wr-count'
      c.textContent = String(count)
      toggle.appendChild(c)
    }
    toggle.addEventListener('click', () => this.mutate(d => {
      const next = toggleFold(d, key)
      d.collapsedSections = next.collapsedSections
      d.expandedSection = next.expandedSection
    }))
    labelRow.appendChild(toggle)
    return labelRow
  }

  /**
   * A section with a header that stays put and a list that scrolls on its own,
   * `rows` tall, plus a handle under it to drag the height in whole rows.
   */
  private sectionShell(state: RailState, key: 'pinned' | 'projects', text: string, count: number): { section: HTMLElement; labelRow: HTMLElement; list: HTMLElement } {
    const folded = this.isCollapsed(state, key)
    const expanded = this.isExpanded(state, key)
    const section = this.doc.createElement('div')
    section.className = 'wr-section wr-' + key + (folded ? ' wr-collapsed' : '') + (expanded ? ' wr-expanded' : '')
    const labelRow = this.sectionHeader(state, key, text, count)
    section.appendChild(labelRow)
    const list = this.doc.createElement('div')
    list.className = 'wr-slist'
    list.dataset.keep = key + '-list'
    const rows = state.sectionRows[key]
    // Expanded: the list takes the whole sidebar and scrolls; the saved row
    // count is left alone so collapsing restores it exactly.
    if (!expanded) list.style.maxHeight = String(rows * ROW_HEIGHT) + 'px'
    if (!folded) {
      section.appendChild(list)
      if (!expanded) section.appendChild(this.resizeHandle(key, list))
    }
    return { section, labelRow, list }
  }

  private resizeHandle(key: 'pinned' | 'projects', list: HTMLElement): HTMLElement {
    const handle = this.doc.createElement('div')
    handle.className = 'wr-resize'
    handle.title = 'Drag to show more or fewer rows'
    handle.setAttribute('role', 'separator')
    handle.setAttribute('aria-orientation', 'horizontal')
    handle.addEventListener('pointerdown', ev => {
      ev.preventDefault()
      const startY = ev.clientY
      const start = this.deps.store.getSnapshot().sectionRows[key]
      let rows = start
      handle.classList.add('wr-dragging')
      try { handle.setPointerCapture(ev.pointerId) } catch { /* old browser */ }
      const move = (e: PointerEvent): void => {
        rows = Math.min(30, Math.max(1, start + Math.round((e.clientY - startY) / ROW_HEIGHT)))
        list.style.maxHeight = String(rows * ROW_HEIGHT) + 'px'
        handle.dataset.rows = String(rows)
      }
      const up = (): void => {
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', up)
        handle.removeEventListener('pointercancel', up)
        handle.classList.remove('wr-dragging')
        if (rows !== start) this.mutate(d => { d.sectionRows = { ...d.sectionRows, [key]: rows } })
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', up)
      handle.addEventListener('pointercancel', up)
    })
    return handle
  }

  private renderProjectRow(state: RailState, pid: string): HTMLElement {
    const p = state.projects[pid]
    const row = this.doc.createElement('div')
    row.className = 'wr-row wr-proj'
    const h = hue(p.hueKey)
    // A plain row with a colour square: a full-width tint read as "selected".
    const stripe = this.doc.createElement('span')
    stripe.className = 'wr-psq'
    stripe.style.background = h.stripe
    const title = this.doc.createElement('span')
    title.className = 'wr-title'
    title.textContent = p.name
    const members = this.doc.createElement('span')
    members.className = 'wr-badge'
    members.textContent = String(this.visibleMembers(state, pid).length)
    row.appendChild(stripe)
    row.appendChild(title)
    const projUnread = this.unreadMark(this.visibleMembers(state, pid).some(sid => this.deps.isUnread?.(sid) === true), 'Unread reply inside')
    if (projUnread !== null) row.appendChild(projUnread)
    const anyWorking = this.workingBadge(this.visibleMembers(state, pid).some(sid => this.deps.isRunning?.(sid) === true))
    if (anyWorking !== null) { row.classList.add('wr-isworking'); row.appendChild(anyWorking) }
    row.appendChild(members)
    row.addEventListener('click', ev => {
      if ((ev.target as HTMLElement).closest('.wr-dots,.wr-menu') !== null) return
      this.openDrawer(pid)
    })
    this.makeSortable(row, 'projects', pid, () => 'reorder',
      (from, pos) => this.mutate(d => { d.projectOrder = reorderIds(d.projectOrder, from, pid, pos === 'after') }))
    const menuKey = 'J:' + pid
    row.appendChild(this.dotsButton(menuKey))
    if (this.openMenuKey === menuKey) {
      row.appendChild(this.menuEl(menuKey, [
        { label: 'Delete project', action: () => this.mutate(d => Object.assign(d, deleteProject(d, pid))) },
      ]))
    }
    return row
  }

  // ---- Drawer (project workspace) ---------------------------------------

  private openDrawer(projectId: string): void {
    this.drawerState = { projectId }
    this.editingInstructions = false
    this.confirmDelete = false
    this.addChatsOpen = false
    this.addChatsQ = ''
    this.renamingProject = null
    this.deps.requestPointerHealth?.([projectId])
    this.renderDrawer()
  }

  private closeDrawer(): void {
    this.drawerState = null
    this.drawer?.remove()
    this.drawer = null
  }

  private renderDrawer(): void {
    if (this.drawerState === null) return
    const state = this.deps.store.getSnapshot()
    const project = state.projects[this.drawerState.projectId]
    this.drawer?.remove()
    if (project === undefined) { this.closeDrawer(); return }
    const pid = project.id
    const drawer = this.doc.createElement('div')
    drawer.className = 'wr-drawer'
    this.drawer = drawer

    // Header: back, project color + name (triple-click renames), actions.
    const head = this.doc.createElement('div')
    head.className = 'wr-dhead'
    const back = this.doc.createElement('button')
    back.className = 'wr-dclose'
    back.textContent = '←'
    back.title = 'Back to the rail'
    back.setAttribute('aria-label', 'Back to the rail')
    back.addEventListener('click', () => this.closeDrawer())
    const swatch = this.doc.createElement('span')
    swatch.className = 'wr-pswatch'
    swatch.style.background = hue(project.hueKey).stripe
    head.appendChild(back)
    head.appendChild(swatch)
    if (this.renamingProject === pid) {
      const input = this.doc.createElement('input')
      input.className = 'wr-rename'
      input.value = project.name
      input.setAttribute('aria-label', 'Project name')
      const done = (save: boolean): void => {
        if (this.renamingProject !== pid) return
        this.renamingProject = null
        const name = input.value.trim()
        if (save && name.length > 0 && name !== project.name) this.mutate(d => Object.assign(d, renameProject(d, pid, name)))
        else this.render()
      }
      input.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') done(true); else if (ev.key === 'Escape') done(false) })
      input.addEventListener('blur', () => done(true))
      head.appendChild(input)
      setTimeout(() => { if (input.isConnected) { input.focus(); input.select() } }, 0)
    } else {
      const title = this.doc.createElement('span')
      title.className = 'wr-ptitle'
      title.textContent = project.name
      title.title = project.name + ', triple-click to rename'
      title.addEventListener('click', ev => { if (ev.detail === 3) { this.renamingProject = pid; this.render() } })
      head.appendChild(title)
    }
    const menuKey = 'J:' + pid + ':head'
    head.appendChild(this.dotsButton(menuKey))
    if (this.openMenuKey === menuKey) head.appendChild(this.menuEl(menuKey, this.projectMenuItems(pid, project.name)))
    drawer.appendChild(head)

    const bodyEl = this.doc.createElement('div')
    bodyEl.className = 'wr-dbody'
    bodyEl.dataset.keep = 'drawer-body'
    drawer.appendChild(bodyEl)
    if (this.confirmDelete) bodyEl.appendChild(this.renderDeleteConfirm(state, pid))
    bodyEl.appendChild(this.renderProjectSettings(state, pid))
    bodyEl.appendChild(this.renderProjectChats(state, pid))
    bodyEl.appendChild(this.renderProjectFiles(state, pid))

    ;(this.panel ?? this.doc.body).appendChild(drawer)
  }

  private renamingProject: string | null = null

  private projectMenuItems(pid: string, name: string): MenuItem[] {
    return [
      { label: 'Rename project', action: () => { this.renamingProject = pid; this.render() } },
      { label: 'Instructions & memory', action: () => { this.editingInstructions = true; this.render() } },
      { label: 'Project color', action: () => {}, swatchFor: 'project:' + pid },
      {
        label: this.deps.store.getSnapshot().projects[pid]?.archived === true ? 'Unarchive project' : 'Archive project', action: () => {
          const wasArchived = this.deps.store.getSnapshot().projects[pid]?.archived === true
          const setArchived = (d: RailState, on: boolean): void => {
            const cur = d.projects[pid]
            if (cur === undefined) return
            const next = { ...cur }
            if (on) next.archived = true
            else delete next.archived
            d.projects[pid] = next
          }
          this.mutate(d => setArchived(d, !wasArchived))
          if (!wasArchived) this.closeDrawer()
          this.showToast((wasArchived ? 'Restored \u201c' : 'Archived \u201c') + name + '\u201d', () => this.mutate(d => setArchived(d, wasArchived)))
        },
      },
      { label: 'Delete project\u2026', action: () => { this.confirmDelete = true; this.render() } },
    ]
  }

  // ---- Project view: instructions & memory -----------------------------------

  private modelLabel(m: { provider: string; model: string; reasoningEffort?: string }): string {
    const g = this.catalog?.find(x => x.id === m.provider)
    const name = g?.models.find(x => x.id === m.model)?.name ?? m.model
    return name + (m.reasoningEffort !== undefined ? ' \u00b7 ' + m.reasoningEffort : '')
  }

  /** Delete confirmation: keeps the files unless asked (Gemini deletes sources with the notebook - a trap). */
  private renderDeleteConfirm(state: RailState, pid: string): HTMLElement {
    const p = state.projects[pid]!
    const box = this.doc.createElement('div')
    box.className = 'wr-confirm'
    const head = this.doc.createElement('div')
    head.className = 'wr-instrhead'
    head.textContent = 'Delete \u201c' + p.name + '\u201d?'
    const note = this.doc.createElement('div')
    note.className = 'wr-checkhint'
    note.textContent = 'Its chats stay in Recents. Or archive it instead to keep everything out of sight.'
    box.appendChild(head)
    box.appendChild(note)
    const fileCount = Object.values(state.docs).filter(d => d.projectId === pid).length
    let cb: HTMLInputElement | null = null
    if (p.dir !== undefined && this.deps.deleteProjectFolder !== undefined) {
      const row = this.doc.createElement('label')
      row.className = 'wr-check'
      cb = this.doc.createElement('input')
      cb.type = 'checkbox'
      cb.checked = this.deleteFiles
      const box2 = cb
      cb.addEventListener('change', () => { this.deleteFiles = box2.checked })
      const t = this.doc.createElement('span')
      const l = this.doc.createElement('span')
      l.className = 'wr-checklabel'
      l.textContent = 'Also delete the project folder'
      const h = this.doc.createElement('span')
      h.className = 'wr-checkhint'
      h.textContent = shortDir(p.dir + '/x') + (fileCount > 0 ? ' \u00b7 uploads and instructions; linked files elsewhere are not touched' : '')
      t.appendChild(l)
      t.appendChild(h)
      row.appendChild(cb)
      row.appendChild(t)
      box.appendChild(row)
    }
    const actions = this.doc.createElement('div')
    actions.className = 'wr-pactions'
    const del = this.doc.createElement('button')
    del.className = 'wr-pbtn wr-pbtn-danger'
    del.textContent = 'Delete'
    del.addEventListener('click', () => {
      const alsoFiles = cb?.checked === true || (cb !== null && this.deleteFiles)
      this.deleteFiles = false
      const before = this.deps.store.getSnapshot()
      this.confirmDelete = false
      this.closeDrawer()
      const finish = (): void => {
        this.mutate(d => Object.assign(d, deleteProject(d, pid)))
        this.showToast('Deleted \u201c' + p.name + '\u201d' + (alsoFiles ? ' and its folder' : ''), alsoFiles ? undefined : () => this.mutate(d => {
          d.projects = before.projects; d.projectOrder = before.projectOrder; d.memberships = before.memberships; d.docs = before.docs
        }))
      }
      if (alsoFiles) void this.deps.deleteProjectFolder!(pid).then(ok => { if (ok) finish(); else this.showToast('Could not delete the folder; the project was kept') })
      else finish()
    })
    const cancel = this.doc.createElement('button')
    cancel.className = 'wr-pbtn'
    cancel.textContent = 'Cancel'
    cancel.addEventListener('click', () => { this.confirmDelete = false; this.deleteFiles = false; this.render() })
    actions.appendChild(del)
    actions.appendChild(cancel)
    box.appendChild(actions)
    return box
  }

  private renderProjectSettings(state: RailState, pid: string): HTMLElement {
    const p = state.projects[pid]!
    const section = this.doc.createElement('div')
    section.className = 'wr-psection wr-instr'
    if (!this.editingInstructions) {
      const card = this.doc.createElement('button')
      card.className = 'wr-instrcard'
      const has = (p.instructions ?? '').trim().length > 0
      const head = this.doc.createElement('span')
      head.className = 'wr-instrhead'
      head.textContent = has ? 'Instructions' : '+ Add instructions'
      card.appendChild(head)
      const body = this.doc.createElement('span')
      body.className = 'wr-instrbody'
      body.textContent = has ? instructionsPreview(p.instructions) : 'Tell the assistant how to work in this project. Applies to every chat started here.'
      card.appendChild(body)
      const flags: string[] = []
      if (p.memory === true) flags.push('Project memory')
      if (p.strict === true) flags.push('Files only')
      if (p.model !== undefined) flags.push(this.modelLabel(p.model))
      if (flags.length > 0) {
        const f = this.doc.createElement('span')
        f.className = 'wr-instrflags'
        f.textContent = flags.join(' · ')
        card.appendChild(f)
      }
      card.addEventListener('click', () => { this.editingInstructions = true; this.render() })
      section.appendChild(card)
      return section
    }
    const form = this.doc.createElement('div')
    form.className = 'wr-instrform'
    const lab = (t: string): HTMLElement => { const l = this.doc.createElement('div'); l.className = 'wr-plabel'; l.textContent = t; return l }
    form.appendChild(lab('Instructions'))
    const ta = this.doc.createElement('textarea')
    ta.className = 'wr-textarea'
    ta.rows = 7
    ta.dataset.keep = 'instr-' + pid
    ta.placeholder = 'e.g. You are helping with Acme’s legal pages. Write in plain English, cite the GDPR article, keep answers short.'
    ta.value = this.instrDraft?.pid === pid ? this.instrDraft.text : (p.instructions ?? '')
    ta.addEventListener('input', () => { this.instrDraft = { pid, text: ta.value } })
    ta.addEventListener('keydown', ev => ev.stopPropagation())
    form.appendChild(ta)
    const check = (label: string, hint: string, on: boolean): HTMLInputElement => {
      const row = this.doc.createElement('label')
      row.className = 'wr-check'
      const cb = this.doc.createElement('input')
      cb.type = 'checkbox'
      cb.checked = on
      const txt = this.doc.createElement('span')
      const strong = this.doc.createElement('span')
      strong.className = 'wr-checklabel'
      strong.textContent = label
      const small = this.doc.createElement('span')
      small.className = 'wr-checkhint'
      small.textContent = hint
      txt.appendChild(strong)
      txt.appendChild(small)
      row.appendChild(cb)
      row.appendChild(txt)
      form.appendChild(row)
      return cb
    }
    const mem = check('Project memory', 'The assistant keeps PROJECT-MEMORY.md with this project’s key facts and decisions, and reads it in every chat.', p.memory === true)
    const strict = check('Answer from project files only', 'No general knowledge or web; if the files don’t say, it says so.', p.strict === true)
    form.appendChild(lab('Default model for new chats'))
    const modelRow = this.doc.createElement('div')
    modelRow.className = 'wr-modelrow'
    const mWrap = this.doc.createElement('span')
    mWrap.className = 'wr-select wr-select-wide'
    const mSel = this.doc.createElement('select')
    mSel.setAttribute('aria-label', 'Default model')
    const eWrap = this.doc.createElement('span')
    eWrap.className = 'wr-select'
    const eSel = this.doc.createElement('select')
    eSel.setAttribute('aria-label', 'Reasoning effort')
    const cur = p.model
    const keyOf = (prov: string, m: string): string => prov + '\u0001' + m
    const fillEfforts = (): void => {
      eSel.replaceChildren()
      const [prov, mid] = mSel.value.split('\u0001')
      const model = this.catalog?.find(g => g.id === prov)?.models.find(x => x.id === mid)
      const efforts = model?.reasoning?.efforts ?? []
      eWrap.hidden = efforts.length === 0
      eSel.appendChild(this.option('', 'Default effort'))
      for (const e of efforts) eSel.appendChild(this.option(e.id, e.name))
      if (cur !== undefined && keyOf(cur.provider, cur.model) === mSel.value && cur.reasoningEffort !== undefined) eSel.value = cur.reasoningEffort
    }
    mSel.appendChild(this.option('', 'dsh default'))
    if (this.catalog === null) {
      if (cur !== undefined) mSel.appendChild(this.option(keyOf(cur.provider, cur.model), this.modelLabel(cur)))
      mSel.appendChild(this.option('__loading', this.catalogLoading ? 'Loading models\u2026' : 'Models unavailable'))
      if (!this.catalogLoading && this.deps.modelCatalog !== undefined) {
        this.catalogLoading = true
        void this.deps.modelCatalog().then(c => { this.catalog = c ?? []; this.catalogLoading = false; this.render() })
      }
    } else {
      for (const g of this.catalog) {
        const og = this.doc.createElement('optgroup')
        og.label = g.name
        for (const m of g.models) og.appendChild(this.option(keyOf(g.id, m.id), m.name))
        mSel.appendChild(og)
      }
    }
    mSel.value = cur !== undefined ? keyOf(cur.provider, cur.model) : ''
    mSel.addEventListener('change', fillEfforts)
    fillEfforts()
    mWrap.appendChild(mSel)
    eWrap.appendChild(eSel)
    modelRow.appendChild(mWrap)
    modelRow.appendChild(eWrap)
    form.appendChild(modelRow)
    form.appendChild(lab('Description (only for you)'))
    const desc = this.doc.createElement('input')
    desc.className = 'wr-pfield wr-pfield-inline'
    desc.dataset.keep = 'desc-' + pid
    desc.value = p.description ?? ''
    desc.placeholder = 'What this project is about'
    desc.addEventListener('keydown', ev => ev.stopPropagation())
    form.appendChild(desc)
    const note = this.doc.createElement('div')
    note.className = 'wr-phint'
    note.textContent = 'Applies to chats started with + New chat here (they run in the project folder). Chats moved in from elsewhere keep their own folder.'
    form.appendChild(note)
    const actions = this.doc.createElement('div')
    actions.className = 'wr-pactions'
    const save = this.doc.createElement('button')
    save.className = 'wr-pbtn wr-pbtn-primary'
    save.textContent = 'Save'
    save.addEventListener('click', () => {
      this.editingInstructions = false
      this.instrDraft = null
      this.mutate(d => {
        const cur = d.projects[pid]
        if (cur === undefined) return
        const [prov, mid] = mSel.value.split('\u0001')
        const model = prov !== undefined && prov.length > 0 && prov !== '__loading' && mid !== undefined
          ? { provider: prov, model: mid, ...(eSel.value.length > 0 ? { reasoningEffort: eSel.value } : {}) }
          : undefined
        const next = { ...cur, instructions: ta.value.trim(), memory: mem.checked, strict: strict.checked, description: desc.value.trim() }
        if (model !== undefined) next.model = model
        else delete next.model
        d.projects[pid] = next
      })
      void this.deps.ensureProject?.(pid).then(dir => this.showToast(dir !== null ? 'Instructions saved' : 'Saved, but the project folder could not be updated'))
    })
    const cancel = this.doc.createElement('button')
    cancel.className = 'wr-pbtn'
    cancel.textContent = 'Cancel'
    cancel.addEventListener('click', () => { this.editingInstructions = false; this.instrDraft = null; this.render() })
    actions.appendChild(save)
    actions.appendChild(cancel)
    form.appendChild(actions)
    section.appendChild(form)
    return section
  }

  /** Unsaved instructions text, kept across redraws. */
  private instrDraft: { pid: string; text: string } | null = null

  /** Upload desktop files into the project folder and list them as project files. */
  async uploadInto(pid: string, files: File[]): Promise<void> {
    if (files.length === 0) return
    if (this.deps.uploadFiles === undefined) { this.showToast('Uploads are not available here'); return }
    this.uploading += files.length
    this.showToast('Uploading ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '…')
    let results: Array<{ name: string; path?: string; error?: string }> = []
    try { results = await this.deps.uploadFiles(pid, files) } finally { this.uploading -= files.length }
    const ok = results.filter(r => r.path !== undefined)
    const bad = results.filter(r => r.path === undefined)
    if (ok.length > 0) {
      this.mutate(d => { for (const r of ok) d.docs = addDoc(d, pid, docKindFor(r.path!), docNameFor(r.path!), r.path!).docs })
      this.deps.requestPointerHealth?.([pid])
      void this.deps.ensureProject?.(pid) // AGENTS.md gains the project_search hint
    }
    if (bad.length > 0) this.showToast('Could not upload ' + bad.map(b => b.name).join(', ') + ': ' + (bad[0]!.error ?? 'error'))
    else this.showToast(ok.length === 1 ? 'Uploaded ' + ok[0]!.name : 'Uploaded ' + ok.length + ' files')
  }

  // ---- Project view: chats --------------------------------------------------

  /** Project members minus archived/trashed chats. */
  private visibleMembers(state: RailState, pid: string): string[] {
    const explicit = projectMembers(state, pid)
    const dir = state.projects[pid]?.dir
    const byFolder = dir !== undefined ? (this.deps.folderMembers?.(dir) ?? []) : []
    const all = [...new Set([...explicit, ...byFolder.filter(sid => state.memberships[sid] === undefined || state.memberships[sid] === pid)])]
    return all.filter(sid => this.deps.isHidden?.(sid) !== true)
  }

  private renderProjectChats(state: RailState, pid: string): HTMLElement {
    const section = this.doc.createElement('div')
    section.className = 'wr-psection'
    const members = this.visibleMembers(state, pid)
    const label = this.doc.createElement('div')
    label.className = 'wr-plabel'
    label.textContent = 'Chats'
    const count = this.doc.createElement('span')
    count.className = 'wr-count'
    count.textContent = String(members.length)
    label.appendChild(count)
    section.appendChild(label)

    // Rows exactly like Recents (open, rename, age, stripe), newest first.
    const recents = this.deps.recents()
    const order = new Map(recents.map((r, i) => [r.id, i]))
    const sorted = [...members].sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9))
    for (const sid of sorted) {
      const known = recents.find(r => r.id === sid)
      const row: RecentRow = known ?? { id: sid, title: this.deps.sessionTitle(sid), workspaceId: null, blank: false, repeat: 'project' }
      const el = this.renderRecentRow(state, { ...row, repeat: 'none', hueKey: state.stripes[sid] }, 'M:', () => [
        { label: 'Rename', action: () => this.startRename(sid, this.deps.sessionTitle(sid)) },
        { label: 'Remove from project', action: () => this.moveChat(sid, null) },
        { label: 'Stripe color', action: () => {}, swatchFor: sid },
        { label: 'Move to bin', action: () => this.binChat(sid) },
      ])
      if (el !== null) section.appendChild(el)
    }
    if (members.length === 0 && !this.addChatsOpen) {
      const empty = this.doc.createElement('div')
      empty.className = 'wr-empty'
      empty.textContent = 'No chats yet. Start one here, or add existing chats.'
      section.appendChild(empty)
    }

    const actions = this.doc.createElement('div')
    actions.className = 'wr-pactions'
    if (this.deps.createSession !== undefined) {
      const newChat = this.doc.createElement('button')
      newChat.className = 'wr-pbtn wr-pbtn-primary'
      newChat.textContent = '+ New chat'
      newChat.title = 'Start a new chat in this project'
      newChat.addEventListener('click', () => { void this.newChatInProject(pid) })
      actions.appendChild(newChat)
    }
    const add = this.doc.createElement('button')
    add.className = 'wr-pbtn'
    add.textContent = this.addChatsOpen ? 'Done' : 'Add chats…'
    add.setAttribute('aria-expanded', String(this.addChatsOpen))
    add.addEventListener('click', () => { this.addChatsOpen = !this.addChatsOpen; this.addChatsQ = ''; this.render() })
    actions.appendChild(add)
    section.appendChild(actions)
    if (this.addChatsOpen) section.appendChild(this.renderAddChats(state, pid))
    return section
  }

  /** Searchable picker of chats not in this project; a click adds one (picker stays open). */
  private renderAddChats(state: RailState, pid: string): HTMLElement {
    const box = this.doc.createElement('div')
    box.className = 'wr-picker'
    const search = this.doc.createElement('input')
    search.className = 'wr-pfield'
    search.dataset.keep = 'addchats'
    search.placeholder = 'Find a chat to add'
    search.value = this.addChatsQ
    const list = this.doc.createElement('div')
    list.className = 'wr-pickerlist'
    const fill = (): void => {
      list.replaceChildren()
      const q = this.addChatsQ.trim().toLowerCase()
      const snap = this.deps.store.getSnapshot()
      const rows = this.deps.recents()
        .filter(r => snap.memberships[r.id] !== pid && (q.length === 0 || r.title.toLowerCase().includes(q)))
        .slice(0, 40)
      if (rows.length === 0) {
        const empty = this.doc.createElement('div')
        empty.className = 'wr-empty'
        empty.textContent = q.length > 0 ? 'No matching chats' : 'Every chat is already here'
        list.appendChild(empty)
      }
      for (const r of rows) {
        const item = this.doc.createElement('button')
        item.className = 'wr-pickitem'
        const t = this.doc.createElement('span')
        t.className = 'wr-title'
        t.textContent = r.title
        item.appendChild(t)
        const other = snap.memberships[r.id]
        if (other !== undefined && snap.projects[other] !== undefined) {
          const tag = this.doc.createElement('span')
          tag.className = 'wr-time'
          tag.textContent = snap.projects[other].name
          tag.title = 'Currently in ' + snap.projects[other].name + ', adding moves it'
          item.appendChild(tag)
        }
        const plus = this.doc.createElement('span')
        plus.className = 'wr-pickplus'
        plus.textContent = '+'
        item.appendChild(plus)
        item.addEventListener('click', ev => { ev.stopPropagation(); this.moveChat(r.id, pid) })
        list.appendChild(item)
      }
    }
    search.addEventListener('input', () => { this.addChatsQ = search.value; fill() })
    search.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Escape') { this.addChatsOpen = false; this.render() } })
    box.appendChild(search)
    box.appendChild(list)
    fill()
    setTimeout(() => { if (search.isConnected && this.doc.activeElement?.tagName !== 'INPUT') search.focus() }, 0)
    return box
  }

  private async newChatInProject(pid: string): Promise<void> {
    // Start the chat IN the project folder: dsh then applies its AGENTS.md
    // (instructions, memory, sources rule) and the files are right there.
    if (this.deps.startProjectChat !== undefined) {
      const sid = await this.deps.startProjectChat(pid)
      if (sid === null) { this.showToast('Could not start a new chat'); return }
      if (this.deps.store.getSnapshot().memberships[sid] !== pid) this.mutate(d => { d.memberships = moveSessionToProject(d, sid, pid).memberships })
      return
    }
    const dir = (await this.deps.ensureProject?.(pid)) ?? undefined
    const id = await this.deps.createSession?.(dir)
    if (id === null || id === undefined) { this.showToast('Could not start a new chat'); return }
    this.mutate(d => { d.memberships = moveSessionToProject(d, id, pid).memberships })
    this.deps.openSession?.(id)
  }

  /**
   * Move a chat into a project (or out, with null) immediately. Journaled
   * membership-only (no doc side effects), so the toast's Undo restores it.
   */
  moveChat(sessionId: string, toProjectId: string | null): void {
    const state = this.deps.store.getSnapshot()
    if (state.memberships[sessionId] === (toProjectId ?? undefined)) return
    const base = planCarryover(state, sessionId, toProjectId, {})
    const plan = { ...base, adds: [], rebinds: [], removes: [] }
    let entryId: string | undefined
    this.mutate(d => { Object.assign(d, applyCarryover(d, plan)); entryId = d.journal[0]?.id })
    const title = this.deps.sessionTitle(sessionId)
    const where = toProjectId === null
      ? 'Removed “' + title + '” from ' + (state.projects[state.memberships[sessionId] ?? '']?.name ?? 'the project')
      : 'Moved “' + title + '” to ' + (state.projects[toProjectId]?.name ?? 'project')
    this.showToast(where, () => this.mutate(d => { const r = revertCarryover(d, entryId); if (r !== null) Object.assign(d, r) }))
  }

  // ---- Project view: files --------------------------------------------------

  private renderProjectFiles(state: RailState, pid: string): HTMLElement {
    const section = this.doc.createElement('div')
    section.className = 'wr-psection wr-files' + (this.dropActive ? ' wr-drop' : '')
    const docs = listDocs(state, pid).sort((a, b) => a.name.localeCompare(b.name))
    const health = this.deps.docHealth?.() ?? {}
    const label = this.doc.createElement('div')
    label.className = 'wr-plabel'
    label.textContent = 'Files'
    const count = this.doc.createElement('span')
    count.className = 'wr-count'
    count.textContent = String(docs.length)
    label.appendChild(count)
    section.appendChild(label)

    if (this.deps.uploadFiles !== undefined) {
      const picker = this.doc.createElement('input')
      picker.type = 'file'
      picker.multiple = true
      picker.hidden = true
      picker.addEventListener('change', () => { const fl = [...(picker.files ?? [])]; picker.value = ''; void this.uploadInto(pid, fl) })
      const up = this.doc.createElement('button')
      up.className = 'wr-pbtn wr-upload'
      up.textContent = this.uploading > 0 ? 'Uploading\u2026' : '\u2191 Upload files'
      up.addEventListener('click', () => picker.click())
      const bar = this.doc.createElement('div')
      bar.className = 'wr-pactions wr-pactions-top'
      bar.appendChild(up)
      bar.appendChild(picker)
      section.appendChild(bar)
    }

    for (const d of docs) section.appendChild(this.renderFileRow(pid, d.id, d.kind, d.name, d.pointer, health[d.id]?.status === 'missing'))

    // One field: paste a path or URL (several lines at once is fine), Enter adds.
    const field = this.doc.createElement('input')
    field.className = 'wr-pfield'
    field.dataset.keep = 'files-' + pid
    field.placeholder = 'Or link a server path / URL, then Enter'
    field.setAttribute('aria-label', 'Add a file by path or URL')
    field.addEventListener('keydown', ev => {
      ev.stopPropagation()
      if (ev.key === 'Enter') { ev.preventDefault(); this.addFiles(pid, field.value) }
    })
    field.addEventListener('paste', ev => {
      const text = ev.clipboardData?.getData('text/plain') ?? ''
      if (text.includes('\n')) { ev.preventDefault(); this.addFiles(pid, text) }
    })
    section.appendChild(field)
    const hint = this.doc.createElement('div')
    hint.className = 'wr-phint'
    hint.textContent = 'Drop files here to upload them. Linked paths stay where they are.'
    section.appendChild(hint)

    const missing = docs.filter(d => health[d.id]?.status === 'missing')
    if (missing.length > 0) {
      const clean = this.doc.createElement('button')
      clean.className = 'wr-plink'
      clean.textContent = 'Remove ' + missing.length + ' missing file' + (missing.length === 1 ? '' : 's')
      clean.addEventListener('click', () => {
        const before = this.deps.store.getSnapshot().docs
        this.mutate(d => { for (const m of missing) d.docs = removeDoc(d, m.id).docs })
        this.showToast('Removed ' + missing.length + ' missing', () => this.mutate(d => { d.docs = before }))
      })
      section.appendChild(clean)
    }

    // Drop target: paths/URLs from any text drag (file managers, the Files panel, the address bar).
    section.addEventListener('dragover', ev => {
      ev.preventDefault()
      if (!this.dropActive) { this.dropActive = true; section.classList.add('wr-drop') }
    })
    section.addEventListener('dragleave', ev => {
      if (ev.relatedTarget instanceof Node && section.contains(ev.relatedTarget)) return
      this.dropActive = false
      section.classList.remove('wr-drop')
    })
    section.addEventListener('drop', ev => {
      ev.preventDefault()
      this.dropActive = false
      const dt = ev.dataTransfer
      const text = dt?.getData('text/uri-list') || dt?.getData('text/plain') || ''
      const dropped = [...(dt?.files ?? [])]
      if (dropped.length > 0) void this.uploadInto(pid, dropped)
      else if (text.trim().length > 0) this.addFiles(pid, text)
      else this.render()
    })
    return section
  }

  /** Add every pointer in `text` to the project; name and kind are inferred. */
  addFiles(pid: string, text: string): void {
    const pointers = parsePointers(text)
    if (pointers.length === 0) return
    const state = this.deps.store.getSnapshot()
    const existing = new Set(listDocs(state, pid).map(d => d.pointer))
    const fresh = pointers.filter(p => !existing.has(p))
    if (fresh.length === 0) { this.showToast(pointers.length === 1 ? 'Already in this project' : 'All of those are already here'); this.render(); return }
    const beforeDocs = state.docs
    this.mutate(d => { for (const p of fresh) d.docs = addDoc(d, pid, docKindFor(p), docNameFor(p), p).docs })
    this.deps.requestPointerHealth?.([pid])
    void this.deps.ensureProject?.(pid)
    this.showToast(fresh.length === 1 ? 'Added ' + docNameFor(fresh[0]!) : 'Added ' + fresh.length + ' files', () => this.mutate(d => { d.docs = beforeDocs }))
  }

  private renderFileRow(pid: string, docId: string, kind: string, name: string, pointer: string, missing: boolean): HTMLElement {
    const row = this.doc.createElement('div')
    row.className = 'wr-row wr-file' + (missing ? ' wr-missing' : '')
    row.dataset.docId = docId
    const icon = this.doc.createElement('span')
    icon.className = 'wr-ficon wr-ficon-' + (isUrl(pointer) ? 'link' : kind)
    icon.textContent = isUrl(pointer) ? '↗' : kind === 'data' ? '{ }' : kind === 'snippet' ? '</>' : '≡'
    row.appendChild(icon)
    const text = this.doc.createElement('span')
    text.className = 'wr-ftext'
    const n = this.doc.createElement('span')
    n.className = 'wr-title'
    n.textContent = name
    const dir = this.doc.createElement('span')
    dir.className = 'wr-fdir'
    dir.textContent = missing ? 'Not found · ' + shortDir(pointer) : shortDir(pointer)
    text.appendChild(n)
    text.appendChild(dir)
    row.appendChild(text)
    row.title = pointer + (missing ? '\n(not found on the server)' : '')
    row.addEventListener('click', ev => {
      if ((ev.target as HTMLElement).closest('.wr-dots,.wr-menu') !== null) return
      this.openPointer(pointer)
    })
    const menuKey = 'F:' + docId
    row.appendChild(this.dotsButton(menuKey))
    if (this.openMenuKey === menuKey) {
      row.appendChild(this.menuEl(menuKey, [
        { label: 'Open', action: () => this.openPointer(pointer) },
        { label: 'Copy path', action: () => { void this.copy(pointer) } },
        { label: 'Remove from project', action: () => {
          const before = this.deps.store.getSnapshot().docs
          this.mutate(d => { d.docs = removeDoc(d, docId).docs })
          this.showToast('Removed ' + name, () => this.mutate(d => { d.docs = before }))
        } },
      ]))
    }
    void pid
    return row
  }

  private openPointer(pointer: string): void {
    if (isUrl(pointer)) { this.doc.defaultView?.open(pointer, '_blank', 'noopener'); return }
    if (this.deps.openFile?.(pointer) === true) return
    void this.copy(pointer, 'No editor available, path copied')
  }

  private async copy(text: string, message = 'Path copied'): Promise<void> {
    try { await this.doc.defaultView?.navigator.clipboard.writeText(text); this.showToast(message) } catch { this.showToast(text) }
  }

  // ---- Toast ----------------------------------------------------------------

  showToast(text: string, undo?: () => void): void {
    if (this.toast?.timer !== undefined) clearTimeout(this.toast.timer)
    const timer = setTimeout(() => { if (this.toast?.timer === timer) { this.toast = null; this.render() } }, 6000)
    this.toast = { text, undo, timer }
    this.render()
  }

  private renderToast(): HTMLElement {
    const t = this.toast!
    const el = this.doc.createElement('div')
    el.className = 'wr-toast'
    el.setAttribute('role', 'status')
    const msg = this.doc.createElement('span')
    msg.className = 'wr-title'
    msg.textContent = t.text
    el.appendChild(msg)
    if (t.undo !== undefined) {
      const undo = this.doc.createElement('button')
      undo.textContent = 'Undo'
      undo.addEventListener('click', ev => {
        ev.stopPropagation()
        const fn = t.undo
        if (t.timer !== undefined) clearTimeout(t.timer)
        this.toast = null
        fn?.()
        this.render()
      })
      el.appendChild(undo)
    }
    return el
  }
  // ---- Recents ----------------------------------------------------------

  private renderRecents(state: RailState): HTMLElement {
    const section = this.doc.createElement('div')
    section.className = 'wr-section wr-grow wr-recents' + (this.isCollapsed(state, 'recents') ? ' wr-collapsed' : '') + (this.isExpanded(state, 'recents') ? ' wr-expanded' : '')
    section.appendChild(this.sectionHeader(state, 'recents', 'Recents', null))
    this.recentsBox = section
    if (this.isCollapsed(state, 'recents')) return section
    const scroller = this.doc.createElement('div')
    scroller.className = 'wr-scroller'
    section.appendChild(scroller)
    this.recentsBox = section
    this.mountRecentsList(state, scroller)
    return section
  }

  private mountRecentsList(state: RailState, scroller: HTMLElement): void {
    const filter = this.filterQ.trim().toLowerCase()
    const rows = this.deps.recents().filter(r => filter.length === 0 || r.title.toLowerCase().includes(filter))
    this.list?.destroy()
    this.list = new VirtualList(scroller, {
      className: 'wr-vl',
      keepKey: 'recents',
      rowHeight: ROW_HEIGHT,
      overscan: 6,
      count: () => rows.length,
      renderRow: (i) => this.renderRecentRow(state, rows[i]),
    })
    // Embedded, the list's height follows the sidebar: re-window on resize.
    this.resizeObs?.disconnect()
    this.resizeObs = null
    if (typeof ResizeObserver !== 'undefined') {
      const list = this.list
      this.resizeObs = new ResizeObserver(() => list.refresh())
      this.resizeObs.observe(list.viewport)
    }
  }

  /** Re-render only the Recents list (keeps the filter input focus). */
  private refreshRecents(): void {
    if (this.recentsBox === null || this.panel === null) return
    const scroller = this.recentsBox.querySelector('.wr-scroller')
    if (!(scroller instanceof HTMLElement)) return
    this.mountRecentsList(this.deps.store.getSnapshot(), scroller)
  }

  private renderRecentRow(state: RailState, row: RecentRow | undefined, menuPrefix = 'R:', items?: () => MenuItem[]): HTMLElement | null {
    if (row === undefined) return null
    const el = this.doc.createElement('div')
    el.className = 'wr-row'
    el.dataset.sessionId = row.id
    if (this.deps.currentId?.() === row.id) el.classList.add('wr-current')
    el.addEventListener('click', ev => {
      if ((ev.target as HTMLElement).closest('.wr-dots,.wr-menu,.wr-rename') !== null || ev.detail > 1) return
      this.deps.openSession?.(row.id)
    })
    if (row.hueKey !== undefined) {
      const stripe = this.doc.createElement('span')
      stripe.className = 'wr-stripe'
      stripe.style.background = stripeColor(row.hueKey)
      el.appendChild(stripe)
    }
    el.appendChild(this.chatTitle(row.id, row.title))
    const unreadMark = this.unreadMark(this.deps.isUnread?.(row.id) === true)
    if (unreadMark !== null) el.appendChild(unreadMark)
    if (row.repeat === 'pinned') {
      const badge = this.doc.createElement('span')
      badge.className = 'wr-badge'
      badge.textContent = '\ud83d\udccc'
      el.appendChild(badge)
    } else if (row.repeat === 'project') {
      const badge = this.doc.createElement('span')
      badge.className = 'wr-badge'
      badge.textContent = '\ud83d\uddc2'
      el.appendChild(badge)
    }
    const working = this.workingBadge(this.deps.isRunning?.(row.id) === true)
    if (working !== null) {
      el.classList.add('wr-isworking')
      el.appendChild(working)
    }
    const age = relativeAge(row.updatedAt)
    if (age.length > 0 && working === null) {
      const time = this.doc.createElement('span')
      time.className = 'wr-time'
      time.textContent = age
      el.appendChild(time)
    }
    const menuKey = menuPrefix + row.id
    el.appendChild(this.dotsButton(menuKey))
    if (this.openMenuKey === menuKey) el.appendChild(this.menuEl(menuKey, items !== undefined ? items() : this.recentsMenuItems(row.id)))
    return el
  }

  private recentsMenuItems(sessionId: string): MenuItem[] {
    const state = this.deps.store.getSnapshot()
    const isPinned = state.pinned.includes(sessionId) || state.sessionFolders[sessionId] !== undefined
    const items: MenuItem[] = [
      { label: 'Rename', action: () => this.startRename(sessionId, this.deps.sessionTitle(sessionId)) },
      isPinned
        ? { label: 'Unpin', action: () => this.mutate(d => Object.assign(d, unpinSession(d, sessionId))) }
        : { label: 'Pin to rail', action: () => this.mutate(d => { d.pinned = [sessionId, ...d.pinned] }) },
    ]
    const current = state.memberships[sessionId]
    for (const pid of state.projectOrder) {
      const p = state.projects[pid]
      if (p === undefined) continue
      const isCurrent = current === pid
      items.push({
        label: (isCurrent ? '\u2713 In ' : 'Move to ') + p.name,
        action: () => this.moveChat(sessionId, pid),
      })
    }
    if (current !== undefined) {
      items.push({ label: 'Remove from ' + (state.projects[current]?.name ?? 'project'), action: () => this.moveChat(sessionId, null) })
    }
    items.push({ label: 'Stripe color', action: () => {}, swatchFor: sessionId })
    items.push({ label: 'Move to bin', action: () => this.binChat(sessionId) })
    return items
  }

  // ---- Shared chrome ------------------------------------------------------

  private dotsButton(menuKey: string): HTMLElement {
    const dots = this.doc.createElement('button')
    dots.className = 'wr-dots'
    dots.textContent = '\u22ef'
    dots.title = 'Actions'
    dots.setAttribute('aria-expanded', String(this.openMenuKey === menuKey))
    dots.addEventListener('click', ev => {
      ev.stopPropagation()
      this.openMenuKey = this.openMenuKey === menuKey ? null : menuKey
      this.render()
    })
    return dots
  }

  private menuEl(menuKey: string, items: MenuItem[]): HTMLElement {
    const menu = this.doc.createElement('div')
    menu.className = 'wr-menu'
    const closer = (ev: Event): void => {
      const target = ev.target as Node
      if (menu.contains(target)) return
      this.openMenuKey = null
      this.render()
      this.doc.removeEventListener('click', closer)
    }
    for (const item of items) {
      if (item.swatchFor !== undefined) { menu.appendChild(this.swatchPicker(item.label, item.swatchFor)); continue }
      const btn = this.doc.createElement('button')
      btn.textContent = item.label
      btn.addEventListener('click', ev => {
        ev.stopPropagation()
        this.doc.removeEventListener('click', closer)
        this.openMenuKey = null
        try { item.action() } catch (error) { this.deps.warn?.(String(error)) }
      })
      menu.appendChild(btn)
    }
    this.doc.addEventListener('click', closer)
    void menuKey
    return menu
  }

  // ---- Rename (triple-click a title, or \u22ef -> Rename) -------------------

  /** Title cell for a chat row: the label, or the inline rename field. */
  private chatTitle(id: string, text: string): HTMLElement {
    const shown = this.pendingTitles.get(id) ?? text
    const r = this.renaming
    if (r !== null && r.id === id) {
      const input = this.doc.createElement('input')
      input.className = 'wr-rename' + (r.error !== undefined ? ' wr-rename-error' : '')
      input.value = r.draft
      input.maxLength = 200
      input.setAttribute('aria-label', 'Chat name')
      input.title = r.error ?? 'Enter to save \u00b7 Esc to cancel'
      const track = (): void => {
        if (this.renaming === null || this.renameInput !== input) return
        this.renaming.draft = input.value
        this.renaming.selStart = input.selectionStart ?? input.value.length
        this.renaming.selEnd = input.selectionEnd ?? input.value.length
      }
      for (const evName of ['input', 'keyup', 'mouseup', 'select']) input.addEventListener(evName, track)
      input.addEventListener('keydown', ev => {
        ev.stopPropagation()
        if (ev.key === 'Enter') { ev.preventDefault(); track(); this.commitRename() }
        else if (ev.key === 'Escape') { ev.preventDefault(); this.cancelRename() }
      })
      for (const evName of ['click', 'dblclick', 'mousedown']) input.addEventListener(evName, ev => ev.stopPropagation())
      input.addEventListener('blur', () => {
        // A re-render swaps this field for a fresh one and refocuses it; only a
        // real focus loss (click elsewhere) saves.
        setTimeout(() => {
          if (this.renaming === null || this.renaming.id !== id) return
          if (this.renameInput !== input) return
          if (this.doc.activeElement === input) return
          this.commitRename()
        }, 0)
      })
      this.renameInput = input
      setTimeout(() => {
        if (!input.isConnected || this.renameInput !== input || this.renaming === null) return
        input.focus()
        input.setSelectionRange(this.renaming.selStart, this.renaming.selEnd)
      }, 0)
      return input
    }
    const title = this.doc.createElement('span')
    title.className = 'wr-title'
    title.textContent = shown
    title.title = shown + ' \u2014 triple-click to rename'
    title.addEventListener('click', ev => {
      if (ev.detail === 3) { ev.stopPropagation(); this.startRename(id, shown) }
    })
    return title
  }

  /** Begin renaming a chat inline (whole title selected, like a file manager). */
  startRename(id: string, current: string): void {
    if (this.deps.renameSession === undefined) return
    const text = this.pendingTitles.get(id) ?? current
    this.openMenuKey = null
    this.renaming = { id, draft: text, selStart: 0, selEnd: text.length }
    this.render()
  }

  private cancelRename(): void {
    this.renaming = null
    this.renameInput = null
    this.render()
  }

  private commitRename(): void {
    const r = this.renaming
    if (r === null) return
    this.renaming = null
    this.renameInput = null
    const title = r.draft.trim()
    const before = this.pendingTitles.get(r.id) ?? this.deps.sessionTitle(r.id)
    if (title.length === 0 || title === before || this.deps.renameSession === undefined) { this.render(); return }
    this.pendingTitles.set(r.id, title)
    this.render()
    void this.deps.renameSession(r.id, title).then(res => {
      if (res.ok) this.pendingTitles.set(r.id, res.title)
      else {
        this.pendingTitles.delete(r.id)
        this.deps.warn?.('workspace-rail: rename failed: ' + res.error)
        // Reopen with the typed text so nothing is lost, and say why.
        this.renaming = { id: r.id, draft: title, selStart: 0, selEnd: title.length, error: 'Rename failed: ' + res.error }
      }
      this.render()
    }, (error: unknown) => {
      this.pendingTitles.delete(r.id)
      this.renaming = { id: r.id, draft: title, selStart: 0, selEnd: title.length, error: 'Rename failed: ' + String(error) }
      this.render()
    })
  }

  /** Drop optimistic titles the host has caught up with. */
  private settlePendingTitles(): void {
    for (const [id, title] of this.pendingTitles) {
      if (this.deps.sessionTitle(id) === title) this.pendingTitles.delete(id)
    }
  }

  /**
   * Inline stripe picker: a labelled row of the 8 palette swatches plus
   * "none". Picking applies immediately and closes the menu; the current hue
   * is marked, so the choice is visible before and after.
   */
  private swatchPicker(label: string, entityId: string): HTMLElement {
    const snap = this.deps.store.getSnapshot()
    const current = entityId.startsWith('project:') ? snap.projects[entityId.slice(8)]?.hueKey : snap.stripes[entityId]
    const wrap = this.doc.createElement('div')
    wrap.className = 'wr-swatches'
    const cap = this.doc.createElement('div')
    cap.className = 'wr-swcap'
    cap.textContent = label
    wrap.appendChild(cap)
    const grid = this.doc.createElement('div')
    grid.className = 'wr-swgrid'
    const projectId = entityId.startsWith('project:') ? entityId.slice(8) : null
    const pick = (value: HueKey | null): void => {
      this.openMenuKey = null
      if (projectId !== null) {
        this.mutate(d => { const p = d.projects[projectId]; if (p !== undefined && value !== null) d.projects[projectId] = { ...p, hueKey: value } })
        return
      }
      this.mutate(d => { if (value === null) delete d.stripes[entityId]; else d.stripes[entityId] = value })
    }
    const none = this.doc.createElement('button')
    none.className = 'wr-sw wr-sw-none'
    none.title = 'No stripe'
    none.setAttribute('aria-label', 'No stripe')
    none.setAttribute('aria-pressed', String(current === undefined))
    none.addEventListener('click', ev => { ev.stopPropagation(); pick(null) })
    if (projectId === null) grid.appendChild(none) // a project always has a color
    for (const key of HUE_KEYS) {
      const sw = this.doc.createElement('button')
      sw.className = 'wr-sw'
      sw.style.background = HUES[key].stripe
      sw.title = HUES[key].label
      sw.setAttribute('aria-label', HUES[key].label)
      sw.setAttribute('aria-pressed', String(current === key))
      sw.addEventListener('click', ev => { ev.stopPropagation(); pick(key) })
      grid.appendChild(sw)
    }
    wrap.appendChild(grid)
    return wrap
  }

  private option(value: string, label: string): HTMLElement {
    const opt = this.doc.createElement('option')
    opt.value = value
    opt.textContent = label
    return opt
  }

  private mutate(fn: (draft: RailState) => void): void {
    this.deps.store.update(fn)
    this.render()
  }

  destroy(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.close()
  }
}