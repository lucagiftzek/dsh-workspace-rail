// SPDX-License-Identifier: Apache-2.0
/**
 * Browser half of the workspace-rail plugin (P3): catalog sync, one-time pin
 * import from dsh-session-pin (read-only), the rail store, and the search
 * bridge - windows are requested over the settings namespace and searched
 * through the pure tiered scoring core. Session-open clicks probe the
 * runtime for a navigation face and degrade to no-op when absent.
 *
 * Runs on DSH 0.1.5 and 0.2.x with the same bundle. Every name in `inject`
 * exists on both lines; anything one line lacks is bound through an optional
 * `ctx.inject([...], cb)` sub-plugin, because a required service that never
 * appears keeps the entry pending and the 0.2.x web boot then reports that
 * plugins did not activate. `settingsScope` (0.1.5 only) is such a service:
 * without it the window bridge is off and the pin import reads the host's
 * native pin set, then a still-installed session-pin (see pin-import.ts).
 * @module dsh-workspace-rail/client
 */
import type { Context } from '@deepseek-ai/cordis'
import { createLocalStoragePersistence, createRailStore, normalizeRailState, type RailPersistence, type RailState } from './store.ts'
import { buildRecents, type CatalogEntry } from './catalog.ts'
import { catalogSignature, createActivityTracker, orderByActivity } from './recents-order.ts'
import { buildSearchDocs, type WindowMap } from './search-docs.ts'
import type { PointerHealth } from './host/pointer-health.ts'
import { rankResults, type ScoredHit } from './scoring.ts'
import { RailPanel, type ModelGroup } from './rail-ui.ts'
import { API_BASE, createRailSync, type FetchLike } from './sync.ts'
import { composeAgentsMd } from './instructions.ts'
import { readPinsFromScope, readPinsWithoutScope, unwrapScopeValue, type BoundScopeLike, type RemoteSettingsLike, type SettingsScopeLike, type WorkspacesListLike } from './pin-import.ts'
import { collectUnread, computeTabTitle, createSeenTracker, FRAME_MS, lastMessageText, lastReplyText, type OutlineTurn } from './tab-title.ts'
import { createTabChrome, type TabChrome } from './tab-chrome.ts'
import { RAIL_ICONS } from './tab-icons.ts'
import * as React from 'react'

export const name = 'workspace-rail'

/** Required services: present on DSH 0.1.5 and 0.2.x alike (see the module note). */
export const inject = ['sessions', 'workspaces', 'slots']

const LOCAL_STORAGE_KEY = 'dsh.workspace-rail.state'
/** Per-browser turn-completion stamps (Recents order survives a reload). */
const COMPLETED_KEY = 'dsh.workspace-rail.completedAt'
/** Per-browser "on screen up to this completion" stamps (unread = completedAt beyond seenAt). */
const SEEN_KEY = 'dsh.workspace-rail.seenAt'
/** Max ids queued for window indexing per request. */
const WINDOW_REQUEST_BATCH = 100
/** Min interval between window requests. */
const WINDOW_REQUEST_COOLDOWN_MS = 30_000

/** Narrow faces the client consumes (plain strings at this boundary). */
interface SessionSummaryFace {
  displayTitle: string
  /** Explicit (user-set) title, when there is one. */
  title?: string
  blank: boolean
  /** True while the chat is working (a turn is in flight). */
  running?: boolean
  updatedAt?: number
  parentId?: string | null
  origin?: string
  /** DSH 0.2.x: local reference counts; `mainView` > 0 marks the chat on screen. */
  retainedBy?: Partial<Record<string, number>>
}
interface SessionsListFace {
  getSnapshot(): {
    phase: string
    ids: readonly string[]
    current?: string | null
    byId: Record<string, SessionSummaryFace | undefined>
    /** DSH 0.2.x: host projections per chat (`turnOutline` carries the message previews). */
    projectionsBySession?: Record<string, { values?: { turnOutline?: readonly OutlineTurn[] }; state?: string } | undefined>
  }
  subscribe(listener: () => void): () => void
}
interface WorkspacesListFace {
  getSnapshot(): { phase: string; items: readonly { workspaceId: string; title: string }[]; archivedSessionIds?: readonly string[] }
  subscribe(listener: () => void): () => void
}
/**
 * Browser glue: catalog sync + pin import + rail panel + search bridge.
 * @param ctx - client cordis context (sessions/workspaces/slots; settingsScope and remote.settings optional).
 * @returns the disposer removing every listener and DOM node.
 */
export function apply(ctx: Context): () => void {
  const disposers: Array<() => void> = []
  const warn = (message: string): void => { try { (ctx as unknown as { logger?: { warn?(m: string): void } }).logger?.warn?.(message) } catch { /* no logger face */ } }

  // Boundary casts: the npm baseline's Context merge does not name these
  // services; runtime probing, never compile-time dependence.
  // dsh 0.1.2-alpha.2 moved the list faces to ctx.sessions.list / ctx.workspaces.list
  // (dsh-session-pin reads them there); fall back to the bare face for older hosts.
  const rawSessions = (ctx as unknown as { sessions?: SessionsListFace & { list?: SessionsListFace } }).sessions
  const rawWorkspaces = (ctx as unknown as { workspaces?: WorkspacesListFace & { list?: WorkspacesListFace } }).workspaces
  const sessions = rawSessions?.list ?? rawSessions
  const workspaces = rawWorkspaces?.list ?? rawWorkspaces
  const optionalInject = (deps: string[], cb: (sub: Record<string, any>) => void): void => {
    ;(ctx as unknown as { inject?(deps: string[], cb: (sub: Record<string, any>) => void): unknown }).inject?.(deps, cb)
  }
  // DSH 0.1.5 only: the settings-scope binder. Bound in an optional sub-plugin
  // (see the module note); the bound scopes belong to that sub-plugin and are
  // dropped with it.
  let settingsScope: SettingsScopeLike | undefined
  let railScope: BoundScopeLike | undefined
  // Both lines: the settings RPC, the pin import's session-pin fallback when there is no settingsScope.
  let remoteSettings: RemoteSettingsLike | undefined

  // State lives on the host behind the rail's own API (settings are memory-only
  // for remote browsers). Browser storage is a cache underneath, never the truth.
  const local = createLocalStoragePersistence(LOCAL_STORAGE_KEY)
  let store: ReturnType<typeof createRailStore>
  const sync = createRailSync({
    fetch: (url, init) => fetch(url, init as RequestInit) as unknown as ReturnType<FetchLike>,
    adopt: next => { store.replace(next, false); local.save(store.getSnapshot()) },
    warn,
  })
  store = createRailStore({
    load: () => local.load(),
    save: state => { local.save(state); sync.save(state) },
  })
  let catalog: CatalogEntry[] = []
  let currentId: string | null = null
  const titleById = new Map<string, string>()
  let lastWindowRequest = 0
  /** Chats working right now (a working subagent marks its parent). */
  let runningIds = new Set<string>()
  /**
   * Recents order: newest completed turn first, driven by the running flag the
   * host already pushes for every chat (see recents-order.ts). No polling.
   */
  const activity = createActivityTracker({
    load: () => { try { const raw = globalThis.localStorage?.getItem(COMPLETED_KEY); return raw ? JSON.parse(raw) as Record<string, number> : null } catch { return null } },
    save: stamps => { try { globalThis.localStorage?.setItem(COMPLETED_KEY, JSON.stringify(stamps)) } catch { /* storage blocked */ } },
  })
  /** Chats in the bin (still known to the host), newest first. */
  let binEntries: Array<{ id: string; title: string; at: number }> = []

  // One-time import of dsh-session-pin's pin level + colors (READ-ONLY). Runs
  // only once the host copy is known, so it can never overwrite real data.
  const localStore = (): Storage | undefined => { try { return typeof window !== 'undefined' ? window.localStorage : undefined } catch { return undefined } }
  const applyImportedPins = (imported: { pinned: string[]; colors: Record<string, string> }): void => {
    if (store.getSnapshot().importedSessionPinAt !== null) return
    store.update(d => {
      if (imported.pinned.length > 0 && d.pinned.length === 0) d.pinned = imported.pinned.slice(0, 500)
      for (const [id, color] of Object.entries(imported.colors)) {
        if (id.length > 0 && color.length > 0 && d.stripes[id] === undefined) d.stripes[id] = color
      }
      d.importedSessionPinAt = Date.now()
    })
  }
  let pinImportRunning = false
  const importSessionPins = (): void => {
    if (store.getSnapshot().importedSessionPinAt !== null) return
    // DSH 0.1.5: the original synchronous reader over the bound namespace.
    if (settingsScope !== undefined) { applyImportedPins(readPinsFromScope(settingsScope, localStore())); return }
    // DSH 0.2.x: the native pin set, else a still-installed session-pin entry
    // (settings RPC), else the local copy.
    if (pinImportRunning) return
    pinImportRunning = true
    void readPinsWithoutScope(workspaces as WorkspacesListLike | undefined, remoteSettings, localStore(), { warn })
      .then(applyImportedPins)
      .catch(error => warn('workspace-rail: session-pin import failed: ' + String(error)))
      .finally(() => { pinImportRunning = false })
  }
  void sync.hydrate(store.getSnapshot()).then(merged => {
    if (merged !== null) { store.replace(merged, false); local.save(merged) }
    importSessionPins()
  })
  // Pick up edits from other tabs/devices when this tab comes back, and idly.
  const refresh = (): void => { void sync.refresh().then(next => { if (next !== null) { store.replace(next, false); local.save(next) } }) }
  if (typeof document !== 'undefined') {
    const onVis = (): void => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVis)
    const iv = setInterval(refresh, 45_000)
    disposers.push(() => { document.removeEventListener('visibilitychange', onVis); clearInterval(iv) })
  }

  const windowsFromScope = (): WindowMap => {
    try {
      const value = unwrapScopeValue(railScope?.getSnapshot?.()) as { windows?: WindowMap } | undefined
      if (value !== null && value !== undefined && typeof value === 'object' && value.windows !== undefined && value.windows !== null) return value.windows
    } catch { /* not exposed */ }
    return {}
  }

  // File existence is checked by the host on demand (GET /health?project=).
  const health: Record<string, PointerHealth> = {}
  const docHealthProvider = (): Record<string, PointerHealth> => health
  const healthInflight = new Set<string>()
  const requestPointerHealth = (projectIds: string[]): void => {
    for (const pid of projectIds) {
      if (healthInflight.has(pid)) continue
      healthInflight.add(pid)
      // Let a just-added file's save land first.
      setTimeout(() => {
        void sync.flush()
          .then(() => fetch(API_BASE + '/health?project=' + encodeURIComponent(pid), { credentials: 'same-origin' }))
          .then(r => (r.ok ? r.json() : {}))
          .then((res: Record<string, PointerHealth>) => {
            let changed = false
            for (const [id, h] of Object.entries(res)) {
              if (health[id]?.status !== h.status) { health[id] = h; changed = true }
            }
            if (changed) panel?.render()
          })
          .catch(error => warn('workspace-rail: file check failed: ' + String(error)))
          .finally(() => healthInflight.delete(pid))
      }, 600)
    }
  }

  /** Queue ids missing windows for host-side indexing (cooldown-guarded). */
  const requestWindows = (): void => {
    const now = Date.now()
    if (now - lastWindowRequest < WINDOW_REQUEST_COOLDOWN_MS) return
    if (railScope?.set === undefined) return
    const have = windowsFromScope()
    const missing = catalog.filter(e => have[e.id] === undefined && !e.blank).slice(0, WINDOW_REQUEST_BATCH).map(e => e.id)
    if (missing.length === 0) return
    lastWindowRequest = now
    try { void railScope.set('indexRequests', missing) } catch { /* degrade silently */ }
  }

  // Chats moved to the trash ("Delete this session") or archived stay in the
  // sessions list; the host marks them in the registry-global archive set, which
  // the stock sidebar hides everywhere. Read it the same way (2026-09-27 fix:
  // trashed chats kept showing in Recents/Pinned/projects).
  const archivedIds = (): ReadonlySet<string> => {
    try { return new Set(workspaces?.getSnapshot().archivedSessionIds ?? []) } catch { return new Set() }
  }

  const rebuild = (): void => {
    if (sessions === undefined) { catalog = []; return }
    const snap = sessions.getSnapshot()
    const archived = archivedIds()
    // DSH 0.1.5 names the open chat; 0.2.x marks it with a mainView reference
    // (the same test the core's own document title uses).
    currentId = typeof snap.current === 'string'
      ? snap.current
      : (snap.ids.find(id => (snap.byId[id]?.retainedBy?.mainView ?? 0) > 0)
        ?? Object.keys(snap.byId).find(id => (snap.byId[id]?.retainedBy?.mainView ?? 0) > 0)
        ?? null)
    const binned = store.getSnapshot().binned
    const running = new Set<string>()
    const bin: Array<{ id: string; title: string; at: number }> = []
    catalog = []
    const keyById = new Map<string, number>()
    const toMs = (v: unknown): number | undefined => typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : undefined
    activity.observe((function* () {
      for (const id of snap.ids) {
        const row = snap.byId[id]
        if (row !== undefined) yield { id, running: row.running === true, updatedAt: toMs(row.updatedAt) }
      }
    })())
    for (const id of snap.ids) {
      const row = snap.byId[id]
      if (row?.running === true) running.add(typeof row.parentId === 'string' && row.parentId.length > 0 ? row.parentId : id)
      // Subagent transcripts ("You are a subagent building…") are children of
      // a chat, not chats: the host nests them under their parent, so should we.
      if (row !== undefined && ((typeof row.parentId === 'string' && row.parentId.length > 0) || row.origin === 'subagent')) continue
      if (archived.has(id)) continue
      const binnedAt = binned[id]
      if (binnedAt !== undefined) {
        const t = typeof row?.title === 'string' && row.title.length > 0 ? row.title : (row?.displayTitle ?? id)
        bin.push({ id, title: t, at: binnedAt })
        continue
      }
      // Last activity END (completed turn) when this browser saw it, else the
      // host's last prompt time: the age column shows the same key Recents sorts by.
      const promptAt = toMs(row?.updatedAt)
      const key = activity.keyOf({ id, running: row?.running === true, updatedAt: promptAt })
      keyById.set(id, key)
      const updatedAt = key > 0 ? key : promptAt
      // An empty chat's display title is its folder name; call it what it is,
      // unless the user named it.
      const explicit = typeof row?.title === 'string' && row.title.length > 0 ? row.title : undefined
      const title = explicit ?? (row?.blank === true ? 'New chat' : row?.displayTitle ?? id)
      const cwd = typeof (row as { cwd?: unknown } | undefined)?.cwd === 'string' ? (row as unknown as { cwd: string }).cwd : undefined
      catalog.push({ id, title, workspaceId: null, blank: row?.blank ?? false, updatedAt, cwd })
    }
    catalog = orderByActivity(catalog, e => keyById.get(e.id) ?? 0)
    if (catalog.length > 5000) catalog = catalog.slice(0, 5000)
    titleById.clear()
    for (const e of catalog) titleById.set(e.id, e.title)
    for (const b of bin) titleById.set(b.id, b.title)
    runningIds = running
    binEntries = bin.sort((a, b) => b.at - a.at)
  }

  // ---- Browser tab: rail icon + live title (src/tab-title.ts) ----------
  // Unread extends the Recents tracker: a completion stamp (running -> idle
  // edge) beyond the chat's seen stamp. The chat on screen is read while the
  // tab is visible: its seen stamp follows its newest completion.
  const readStamps = (key: string): Record<string, number> | null => {
    try { const raw = globalThis.localStorage?.getItem(key); return raw ? JSON.parse(raw) as Record<string, number> : null } catch { return null }
  }
  const seen = createSeenTracker({
    load: () => readStamps(SEEN_KEY),
    save: stamps => { try { globalThis.localStorage?.setItem(SEEN_KEY, JSON.stringify(stamps)) } catch { /* storage blocked */ } },
    // First run: everything finished so far counts as read.
    seed: () => readStamps(COMPLETED_KEY) ?? {},
  })
  let tabChrome: TabChrome | null = null
  let tabFrame = 0
  let tabTimer: ReturnType<typeof setInterval> | null = null
  /** A global panel (settings, artifacts...) replaces the conversation: no chat on screen. */
  let panelOpen = false
  const projectionAsked = new Set<string>()
  const outlineOf = (id: string): readonly OutlineTurn[] | undefined => {
    const snap = sessions?.getSnapshot()
    const p = snap?.projectionsBySession?.[id]
    const outline = p?.values?.turnOutline
    if (outline === undefined && !projectionAsked.has(id)) {
      // Not pushed yet (the host has not loaded that chat): one explicit read.
      projectionAsked.add(id)
      const rs = rawSessions as unknown as { refreshProjections?(id: string): Promise<void> } | undefined
      try { void rs?.refreshProjections?.(id)?.catch?.(() => {}) } catch { /* no projection face */ }
    }
    return outline
  }
  const stopTabTimer = (): void => { if (tabTimer !== null) { clearInterval(tabTimer); tabTimer = null } }
  /** Unread chats (same set for the tab title and the blue row markers). */
  let unreadIds: ReadonlySet<string> = new Set()
  let unreadKey = ''
  const unreadSubs = new Set<() => void>()
  /** Collapsed sidebar face: how many chats are unread, live. */
  const unreadCount = { get: (): number => unreadIds.size, subscribe: (fn: () => void): (() => void) => { unreadSubs.add(fn); return () => { unreadSubs.delete(fn) } } }
  /**
   * Re-derive unread (marking the chat on screen read) and, unless switched
   * off, the tab icon and title.
   * @returns true when the unread set changed (the rail must redraw its markers).
   */
  const updateTab = (): boolean => {
    if (typeof document === 'undefined') return false
    let changed = false
    try {
      const visible = document.visibilityState === 'visible'
      const curEntry = currentId !== null && !panelOpen ? catalog.find(e => e.id === currentId) : undefined
      const onScreen = curEntry !== undefined && !curEntry.blank ? curEntry : undefined
      const unread = collectUnread({ entries: catalog, completedAt: id => activity.completedAt(id), seen, onScreen: onScreen?.id ?? null, visible })
      const key = unread.map(u => u.id).join('|')
      if (key !== unreadKey) {
        unreadKey = key
        unreadIds = new Set(unread.map(u => u.id))
        changed = true
        for (const fn of [...unreadSubs]) { try { fn() } catch { /* listener gone */ } }
      }
      if (!store.getSnapshot().tabTitle) {
        stopTabTimer()
        tabChrome?.stop()
        tabChrome = null
        return changed
      }
      if (tabChrome === null) tabChrome = createTabChrome(document, RAIL_ICONS)
      const running = onScreen !== undefined && runningIds.has(onScreen.id)
      let newest = unread[0]
      for (const u of unread) if (u.completedAt > newest!.completedAt) newest = u
      const result = computeTabTitle({
        unread: unread.map(u => ({ ...u, text: u === newest && !running ? lastReplyText(outlineOf(u.id)) : '' })),
        current: onScreen === undefined ? null : {
          id: onScreen.id,
          running,
          text: unread.length === 0 && !running ? lastMessageText(outlineOf(onScreen.id)) : '',
          title: onScreen.title,
        },
        frame: tabFrame,
      })
      tabChrome.setTitle(result.title)
      if (result.animate && tabTimer === null) tabTimer = setInterval(() => { tabFrame++; if (updateTab()) redrawMarkers() }, FRAME_MS)
      else if (!result.animate) stopTabTimer()
    } catch (error) {
      warn('workspace-rail: tab title failed: ' + String(error))
    }
    return changed
  }
  /** Redraw the rail when only the unread markers changed (the list signature carries them too). */
  const redrawMarkers = (): void => { try { lastSig = signature(); panel?.render() } catch { /* panel not mounted yet */ } }
  if (typeof document !== 'undefined') {
    const onTabVis = (): void => { if (updateTab()) redrawMarkers() }
    const onStorage = (ev: StorageEvent): void => { if (ev.key === SEEN_KEY) { seen.reload(); if (updateTab()) redrawMarkers() } }
    document.addEventListener('visibilitychange', onTabVis)
    globalThis.addEventListener?.('storage', onStorage)
    disposers.push(() => {
      document.removeEventListener('visibilitychange', onTabVis)
      globalThis.removeEventListener?.('storage', onStorage)
      stopTabTimer()
      tabChrome?.stop()
      tabChrome = null
    })
  }
  // Optional layout face (DSH 0.2.x): which central panel shows.
  try {
    optionalInject(['layout'], sub => {
      const info = (sub.layout as { panelInfo?: { getSnapshot?(): { activePanelId?: unknown }; subscribe?(fn: () => void): () => void } } | undefined)?.panelInfo
      if (typeof info?.getSnapshot !== 'function') return
      const read = (): void => {
        let open = false
        try { open = (info.getSnapshot!()?.activePanelId ?? null) !== null } catch { open = false }
        if (open !== panelOpen) { panelOpen = open; if (updateTab()) redrawMarkers() }
      }
      read()
      const off = info.subscribe?.(read)
      sub.effect?.(() => () => { try { off?.() } catch { /* gone */ } if (panelOpen) { panelOpen = false; if (updateTab()) redrawMarkers() } }, 'workspace-rail: layout panel')
    })
  } catch (error) { warn('workspace-rail: layout hook unavailable: ' + String(error)) }

  /** Session-open probe: try known navigation faces, else no-op. */
  const openSession = (id: string): void => {
    const ctxAny = ctx as unknown as Record<string, any>
    // Proper UI navigation (select + show the conversation) when the workspace
    // UI service is present; sessions.open alone only selects, and an empty
    // chat then falls back to the New Session screen.
    if (uiWorkspace !== null) {
      try { uiWorkspace.openSession(id); return } catch { /* fall back */ }
    }
    // The current host exposes ctx.sessions.open(id), which returns nothing:
    // call it and stop, rather than falling through to the legacy faces.
    if (typeof ctxAny.sessions?.open === 'function') {
      try { ctxAny.sessions.open(id); return } catch { /* try legacy faces */ }
    }
    const candidates = [
      () => ctxAny.sessions?.open?.(id),
      () => ctxAny.workspace?.openSession?.(id),
      () => ctxAny.connection?.api?.session?.open?.({ sessionId: id }),
    ]
    for (const tryFn of candidates) {
      try { const r = tryFn(); if (r !== undefined && r !== null) return } catch { /* next face */ }
    }
  }

  const search = (query: string): Array<ScoredHit & { title: string }> => {
    const state = store.getSnapshot()
    const docs = buildSearchDocs(catalog, state, windowsFromScope())
    const hits = rankResults(docs, query, Date.now())
    return hits.slice(0, 8).map(h => ({ ...h, title: titleById.get(h.id) ?? h.id }))
  }

  // The host list changes on every streamed token of a running chat. Redraw
  // only when something the rail SHOWS changed (order, ids, titles, blank,
  // current, the minute of last activity, working) - full redraws on every tick
  // were the flicker, the lost hover, and the focus stolen while typing.
  // Seeded when the panel first draws, so the first host tick is a no-op too.
  let lastSig = ''
  const signature = (): string => catalogSignature(catalog, currentId, binEntries.length, runningIds) + '|u:' + unreadKey
  if (sessions !== undefined) {
    disposers.push(sessions.subscribe(() => {
      rebuild()
      updateTab()
      const sig = signature()
      if (sig === lastSig) return
      lastSig = sig
      requestWindows()
      panel?.render()
    }))
  }
  if (workspaces !== undefined) {
    // The archive set lives on the workspaces list: re-derive when it changes.
    disposers.push(workspaces.subscribe(() => { rebuild(); updateTab(); panel?.render() }))
  }

  /** Create/refresh the project folder and its AGENTS.md; remember the folder. */
  const ensureProjectImpl = async (pid: string): Promise<string | null> => {
    const p = store.getSnapshot().projects[pid]
    if (p === undefined) return null
    try {
      await sync.flush()
      const r = await fetch(API_BASE + '/project', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-requested-with': 'dsh-workspace-rail' },
        body: JSON.stringify({ id: p.id, name: p.name, dir: p.dir, instructions: composeAgentsMd({ ...p, hasFiles: Object.values(store.getSnapshot().docs).some(d => d.projectId === pid) }) }),
      })
      const body = await r.json().catch(() => ({})) as { dir?: string; error?: string }
      if (!r.ok || typeof body.dir !== 'string') { warn('workspace-rail: project folder failed: ' + String(body.error ?? r.status)); return null }
      if (store.getSnapshot().projects[pid]?.dir !== body.dir) {
        store.update(d => { const cur = d.projects[pid]; if (cur !== undefined) d.projects[pid] = { ...cur, dir: body.dir } })
      }
      return body.dir
    } catch (error) { warn('workspace-rail: project folder failed: ' + String(error)); return null }
  }

  // ---- Sidebar seat: the rail IS the sidebar list, with a Rail | Folders switch.
  const slots = (ctx as unknown as { slots?: SlotsLike }).slots
  const view = createViewStore()
  const seat = { mount: (): void => {}, unmount: (): void => {} }
  const setView = (next: SidebarView): void => {
    view.set(next)
    if (next === 'rail') seat.mount(); else seat.unmount()
  }
  // Optional workspace UI service: proper chat navigation + New Session flow.
  let uiWorkspace: { openSession(id: string): void; connectWorkspace(ws: string): Promise<string> } | null = null
  try {
    ;(ctx as unknown as { inject?(deps: string[], cb: (sub: Record<string, any>) => void): unknown }).inject?.(['uiWorkspace'], sub => {
      const u = sub.uiWorkspace as typeof uiWorkspace
      if (u !== null && typeof u?.openSession === 'function' && typeof u.connectWorkspace === 'function') uiWorkspace = u
    })
  } catch (error) { warn('workspace-rail: workspace UI hook unavailable: ' + String(error)) }

  // Optional host remote (model catalog + per-chat model selection).
  let remoteSession: { modelCatalog(): Promise<{ ok: boolean; value?: { groups?: unknown[] }; error?: { message?: string } }>; selectModel(r: Record<string, string>): Promise<{ ok: boolean; error?: { message?: string } }> } | null = null
  try {
    ;(ctx as unknown as { inject?(deps: string[], cb: (sub: Record<string, any>) => void): unknown }).inject?.(['remote', 'remote.session'], sub => { // 'remote.session' is its own service; reading it under 'remote' alone throws
      const rs = sub.remote?.session
      if (typeof rs?.modelCatalog === 'function' && typeof rs?.selectModel === 'function') remoteSession = rs
    })
  } catch (error) { warn('workspace-rail: model hook unavailable: ' + String(error)) }

  // Optional settings RPC (both lines). Its own sub-plugin, so a host without
  // it never blocks the model hook above or the rail itself.
  try {
    optionalInject(['remote', 'remote.settings'], sub => {
      const rs = sub.remote?.settings as RemoteSettingsLike | undefined
      if (typeof rs?.describe !== 'function') return
      remoteSettings = rs
      sub.effect?.(() => () => { if (remoteSettings === rs) remoteSettings = undefined }, 'workspace-rail: settings rpc')
    })
  } catch (error) { warn('workspace-rail: settings rpc unavailable: ' + String(error)) }

  // Optional settings-scope binder (DSH 0.1.5): the rail's own namespace is the
  // window bridge; session-pin's namespace feeds the pin import.
  try {
    optionalInject(['settingsScope'], sub => {
      const binder = sub.settingsScope as SettingsScopeLike | undefined
      if (binder === undefined || binder === null) return
      settingsScope = binder
      try { railScope = binder.bind?.<BoundScopeLike>({ namespace: 'workspace-rail' }) } catch { /* not exposed */ }
      sub.effect?.(() => () => {
        if (settingsScope === binder) { settingsScope = undefined; railScope = undefined }
      }, 'workspace-rail: settings scope')
      // The mount-time request ran before the scope was bound.
      requestWindows()
    })
  } catch (error) { warn('workspace-rail: settings scope unavailable: ' + String(error)) }

  // Optional editor: dsh-better-sidebar's openFile, bound only if that service
  // exists. Reading ctx.betterSidebar without declaring it throws, and making
  // it a hard inject would stop the rail loading on hosts without it.
  let openFileImpl: ((path: string) => void) | null = null
  try {
    const ctxInject = ctx as unknown as { inject?(deps: string[], cb: (sub: Record<string, any>) => void): unknown }
    ctxInject.inject?.(['betterSidebar'], sub => {
      const bs = sub.betterSidebar as { features?: readonly string[]; openFile?(scope: { sessionId: string; cwd?: string }, path: string, title?: string): void } | undefined
      if (bs?.openFile === undefined || (Array.isArray(bs.features) && !bs.features.includes('openFile'))) return
      openFileImpl = (path: string) => {
        const snap = (rawSessions?.list ?? rawSessions)?.getSnapshot() as { byId?: Record<string, { cwd?: string } | undefined> } | undefined
        const sid = currentId ?? catalog[0]?.id
        if (sid === undefined) throw new Error('no chat open')
        bs.openFile!({ sessionId: sid, cwd: snap?.byId?.[sid]?.cwd }, path)
      }
    })
  } catch (error) {
    warn('workspace-rail: editor hook unavailable: ' + String(error))
  }

  // Bin changes must reach the catalog BEFORE the panel redraws (registered first, so it runs first).
  disposers.push(store.subscribe(() => { rebuild(); updateTab() }))
  let panel: RailPanel | null = null
  if (typeof document !== 'undefined') {
    try {
      rebuild()
      panel = new RailPanel({
        store,
        sessionTitle: id => titleById.get(id) ?? id,
        isHidden: id => archivedIds().has(id) || store.getSnapshot().binned[id] !== undefined,
        isRunning: id => runningIds.has(id),
        isUnread: id => unreadIds.has(id),
        binned: () => binEntries,
        deleteForever: async (id: string) => {
          // The host's archive set: hides the chat everywhere (also in the stock
          // Folders view). There is no un-archive on the host, so this is final.
          try {
            if (uiWorkspace !== null && typeof (uiWorkspace as unknown as { archiveSession?: unknown }).archiveSession === 'function') {
              await (uiWorkspace as unknown as { archiveSession(id: string): Promise<void> }).archiveSession(id)
            } else {
              const ws = rawWorkspaces as unknown as { archiveSession?(id: string): Promise<unknown> } | undefined
              if (typeof ws?.archiveSession !== 'function') return false
              await ws.archiveSession(id)
            }
            // Drop the bin record once the archive set has caught up (no flash of the chat in between).
            setTimeout(() => { if (archivedIds().has(id)) store.update(d => { delete d.binned[id] }) }, 2000)
            return true
          } catch (error) { warn('workspace-rail: delete failed: ' + String(error)); return false }
        },
        recents: () => {
          const state = store.getSnapshot()
          const pinnedSet = new Set([...state.pinned, ...Object.keys(state.sessionFolders)])
          // A chat with no messages yet stays visible when it is in a project,
          // pinned, or open - only abandoned empty chats are hidden.
          const keep = (e: CatalogEntry): boolean => !e.blank || e.id === currentId || pinnedSet.has(e.id) || state.memberships[e.id] !== undefined
          return buildRecents(catalog.filter(keep).map(e => (e.blank ? { ...e, blank: false } : e)), {
            pinnedIds: [...pinnedSet],
            memberships: state.memberships,
            projects: state.projects as Record<string, { hueKey: string }>,
            stripes: state.stripes,
          })
        },
        search,
        openSession,
        requestWindows: () => requestWindows(),
        docHealth: docHealthProvider,
        requestPointerHealth,
        warn,
        currentId: () => currentId,
        createSession: async (dir?: string) => {
          const ctxAny = ctx as unknown as { sessions?: { create?(o?: { cwd?: string }): Promise<string> } }
          if (typeof ctxAny.sessions?.create !== 'function') return null
          // In a project: its folder. Otherwise where the open chat lives.
          let cwd: string | undefined = dir
          if (cwd === undefined) {
            try {
              const snap = (rawSessions?.list ?? rawSessions)?.getSnapshot() as { byId?: Record<string, { cwd?: string } | undefined> } | undefined
              const c = currentId !== null ? snap?.byId?.[currentId]?.cwd : undefined
              if (typeof c === 'string' && c.length > 0) cwd = c
            } catch { /* no cwd */ }
          }
          try { return await ctxAny.sessions.create(cwd !== undefined ? { cwd } : undefined) } catch (error) { warn('workspace-rail: new chat failed: ' + String(error)); return null }
        },
        folderMembers: (dir: string) => {
          const want = dir.replace(/\/+$/, '')
          return catalog.filter(e => typeof e.cwd === 'string' && e.cwd.replace(/\/+$/, '') === want).map(e => e.id)
        },
        startProjectChat: async (pid: string) => {
          // 1) the folder (and AGENTS.md), 2) the folder as a dsh workspace
          // titled like the project, 3) its reusable blank chat, 4) open it.
          const dir = await ensureProjectImpl(pid)
          if (dir === null) return null
          const ws = rawWorkspaces as unknown as { create?(i: { path: string }): Promise<{ workspaceId: string; title?: string }>; rename?(id: string, t: string): Promise<unknown> } | undefined
          if (uiWorkspace === null || typeof ws?.create !== 'function') {
            const ctxAny = ctx as unknown as { sessions?: { create?(o?: { cwd?: string }): Promise<string> } }
            const id = await ctxAny.sessions?.create?.({ cwd: dir }).catch(() => null)
            if (typeof id === 'string') openSession(id)
            return typeof id === 'string' ? id : null
          }
          try {
            const view = await ws.create({ path: dir })
            const name = store.getSnapshot().projects[pid]?.name
            if (name !== undefined && view.title !== name) { try { await ws.rename?.(view.workspaceId, name) } catch { /* title is cosmetic */ } }
            if (store.getSnapshot().projects[pid]?.workspaceId !== view.workspaceId) {
              store.update(d => { const cur = d.projects[pid]; if (cur !== undefined) d.projects[pid] = { ...cur, workspaceId: view.workspaceId } })
            }
            const sid = await uiWorkspace.connectWorkspace(view.workspaceId)
            // The project's default model, set before the first message.
            const m = store.getSnapshot().projects[pid]?.model
            if (m !== undefined && remoteSession !== null) {
              try {
                const r = await remoteSession.selectModel({ sessionId: sid, provider: m.provider, model: m.model, ...(m.reasoningEffort !== undefined ? { reasoningEffort: m.reasoningEffort } : {}) })
                if (!r.ok) warn('workspace-rail: project model not applied: ' + String(r.error?.message ?? ''))
              } catch (error) { warn('workspace-rail: project model not applied: ' + String(error)) }
            }
            uiWorkspace.openSession(sid)
            return sid
          } catch (error) {
            warn('workspace-rail: project chat failed: ' + String(error))
            return null
          }
        },
        ensureProject: async (pid: string) => ensureProjectImpl(pid),
        modelCatalog: async () => {
          if (remoteSession === null) return null
          try {
            const r = await remoteSession.modelCatalog()
            if (!r.ok) return null
            return ((r.value?.groups ?? []) as ModelGroup[]).filter(g => Array.isArray(g.models) && g.models.length > 0)
          } catch { return null }
        },
        deleteProjectFolder: async (pid: string) => {
          try {
            await sync.flush()
            const r = await fetch(API_BASE + '/project/delete', {
              method: 'POST', credentials: 'same-origin',
              headers: { 'content-type': 'application/json', 'x-requested-with': 'dsh-workspace-rail' },
              body: JSON.stringify({ id: pid }),
            })
            return r.ok
          } catch { return false }
        },
        uploadFiles: async (pid: string, files: File[]) => {
          // The folder must exist and the project must be on the host first.
          await sync.flush()
          const out: Array<{ name: string; path?: string; error?: string }> = []
          for (const f of files) {
            try {
              const r = await fetch(API_BASE + '/upload?project=' + encodeURIComponent(pid) + '&name=' + encodeURIComponent(f.name), {
                method: 'POST', credentials: 'same-origin',
                headers: { 'content-type': 'application/octet-stream', 'x-requested-with': 'dsh-workspace-rail' },
                body: f,
              })
              const body = await r.json().catch(() => ({})) as { path?: string; name?: string; error?: string; dir?: string }
              if (r.ok && typeof body.path === 'string') {
                out.push({ name: body.name ?? f.name, path: body.path })
                if (typeof body.dir === 'string' && store.getSnapshot().projects[pid]?.dir === undefined) {
                  store.update(d => { const cur = d.projects[pid]; if (cur !== undefined) d.projects[pid] = { ...cur, dir: body.dir } })
                }
              } else out.push({ name: f.name, error: String(body.error ?? 'HTTP ' + r.status) })
            } catch (error) { out.push({ name: f.name, error: String(error) }) }
          }
          return out
        },
        openFile: (path: string) => {
          if (openFileImpl === null) return false
          try { openFileImpl(path); return true } catch (error) { warn('workspace-rail: open file failed: ' + String(error)); return false }
        },
        renameSession: async (id, title) => {
          // ISessions.binding(id) exists for every listed chat; its session face
          // renames through the host and pins the title (no auto-regeneration).
          const ctxAny = ctx as unknown as { sessions?: { binding?(id: string): { session?: { rename?(t: string): Promise<unknown> } } | undefined } }
          let binding: { session?: { rename?(t: string): Promise<unknown> } } | undefined
          try { binding = ctxAny.sessions?.binding?.(id) } catch { binding = undefined }
          const rename = binding?.session?.rename
          if (typeof rename !== 'function') return { ok: false as const, error: 'this chat is not available to rename right now' }
          try {
            const res = await rename.call(binding!.session, title) as { ok?: boolean; value?: { title?: string }; error?: { message?: string; code?: string } } | undefined
            if (res?.ok === true) return { ok: true as const, title: typeof res.value?.title === 'string' ? res.value.title : title }
            return { ok: false as const, error: String(res?.error?.message ?? res?.error?.code ?? 'rejected by the host') }
          } catch (error) {
            return { ok: false as const, error: String(error) }
          }
        },
        onSwitchView: slots !== undefined ? () => setView('folders') : undefined,
      })
      if (slots !== undefined) {
        disposers.push(mountSidebarSeat(slots, panel, view, seat, setView, warn, unreadCount))
        if (view.get() === 'rail') seat.mount()
      } else {
        // No slot registry (old host / tests): legacy floating panel.
        panel.mountLauncher()
        panel.open()
      }
      lastSig = signature()
      updateTab()
      requestWindows()
    } catch (error) {
      warn('workspace-rail: panel mount failed: ' + String(error))
      panel = null
    }
  }

  return () => {
    for (const d of disposers) { try { d() } catch { /* already gone */ } }
    disposers.length = 0
    panel?.destroy()
    panel = null
  }
}
// ---- sidebar seat wiring ----------------------------------------------------

type SidebarView = 'rail' | 'folders'
const VIEW_KEY = 'dsh.workspace-rail.view'

interface SlotsLike {
  inject(name: string, factory: () => unknown): () => void
  register(opts: Record<string, unknown>, component: unknown): unknown
}

interface ViewStore {
  get(): SidebarView
  set(v: SidebarView): void
  subscribe(fn: () => void): () => void
}

/** The chosen sidebar view, remembered per browser (a UI preference, not data). */
function createViewStore(): ViewStore {
  let value: SidebarView = 'rail'
  try { if (globalThis.localStorage?.getItem(VIEW_KEY) === 'folders') value = 'folders' } catch { /* storage blocked */ }
  const subs = new Set<() => void>()
  return {
    get: () => value,
    set(v) {
      if (v === value) return
      value = v
      try { globalThis.localStorage?.setItem(VIEW_KEY, v) } catch { /* storage blocked */ }
      for (const fn of [...subs]) fn()
    },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn) } },
  }
}

/** The unread blue (rail-style.ts --wr-unread), picked for the current theme. */
const unreadBlue = (): string => (typeof document !== 'undefined' && document.body?.hasAttribute('data-ds-dark-theme') ? '#4c9aff' : '#1f6feb')
const RAIL_ICON = '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11"/><path d="M6 2.5v11M8.5 6h3.5M8.5 8.5h3.5M8.5 11h2"/></svg>'

/**
 * Register the rail in the `sidebar.workspaces` seat (priority -2 shadows
 * dsh-metafolder-plugin at -1, which shadows the shipped browser at 0), plus a
 * footer switch that brings the rail back while the Folders view is showing.
 * Unregistering the seat is what reveals the folder view: nothing is hidden
 * with CSS, and removing this plugin restores the previous sidebar exactly.
 */
function mountSidebarSeat(
  slots: SlotsLike,
  panel: RailPanel,
  view: ViewStore,
  seat: { mount(): void; unmount(): void },
  setView: (v: SidebarView) => void,
  warn: (m: string) => void,
  unread: { get(): number; subscribe(fn: () => void): () => void },
): () => void {
  const h = React.createElement

  function RailSeat(props: { wide?: boolean; expandSidebar?: () => void }): unknown {
    const ref = React.useRef<HTMLDivElement | null>(null)
    const wide = props.wide !== false
    const unreadN = React.useSyncExternalStore(unread.subscribe, unread.get)
    React.useEffect(() => {
      if (!wide || ref.current === null) return
      panel.open(ref.current)
      return () => panel.close()
    }, [wide])
    if (!wide) {
      // Collapsed 56px column: one icon that asks the shell to expand.
      // Unread replies: a blue dot on the icon (the rows are hidden here).
      const label = unreadN > 0 ? 'Rail, ' + unreadN + (unreadN === 1 ? ' unread reply' : ' unread replies') : 'Rail'
      return h('button', {
        type: 'button',
        title: label,
        'aria-label': label,
        onClick: () => props.expandSidebar?.(),
        style: { all: 'unset', cursor: 'pointer', display: 'flex', justifyContent: 'center', padding: '8px 0', color: 'var(--dsw-alias-label-secondary)' },
      },
      h('span', { style: { position: 'relative', display: 'inline-flex' } },
        h('span', { style: { display: 'inline-flex' }, dangerouslySetInnerHTML: { __html: RAIL_ICON } }),
        unreadN > 0 ? h('span', { className: 'wr-unread-compact', title: 'Unread reply', style: { position: 'absolute', top: -2, right: -3, width: 7, height: 7, borderRadius: '50%', background: unreadBlue(), boxShadow: '0 0 0 1.5px var(--dsw-specific-sidebar-fill, #fff)' } }) : null))
    }
    return h('div', {
      ref,
      className: 'wr-seat',
      style: { flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingTop: 4 },
    })
  }

  function RailFooterSwitch(props: { wide?: boolean }): unknown {
    const current = React.useSyncExternalStore(view.subscribe, view.get)
    if (current === 'rail') return null
    return h('button', {
      type: 'button',
      title: 'Back to the rail view',
      onClick: () => setView('rail'),
      style: {
        all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 6px', fontSize: 12, whiteSpace: 'nowrap', flex: 'none', color: 'var(--dsw-alias-label-secondary)',
      },
    }, h('span', { style: { display: 'inline-flex' }, dangerouslySetInnerHTML: { __html: RAIL_ICON } }), props.wide !== false ? 'Rail' : null)
  }

  let seatDispose: (() => void) | null = null
  seat.mount = () => {
    if (seatDispose !== null) return
    try {
      seatDispose = slots.inject('sidebar.workspaces', () => slots.register({
        name: 'sidebar.workspaces',
        priority: -2,
        locale: 'workspace',
        inject: () => ({}),
      }, RailSeat))
    } catch (error) {
      warn('workspace-rail: sidebar seat registration failed: ' + String(error))
    }
  }
  seat.unmount = () => {
    const d = seatDispose
    seatDispose = null
    try { d?.() } catch { /* already gone */ }
    panel.close()
  }

  let footerDispose: (() => void) | null = null
  try {
    footerDispose = slots.inject('sidebar.footer.action', () => slots.register({
      name: 'sidebar.footer.action',
      id: 'dsh-workspace-rail-view',
      order: 40,
      inject: () => ({}),
    }, RailFooterSwitch))
  } catch (error) {
    warn('workspace-rail: footer switch registration failed: ' + String(error))
  }

  return () => {
    seat.unmount()
    try { footerDispose?.() } catch { /* already gone */ }
  }
}
