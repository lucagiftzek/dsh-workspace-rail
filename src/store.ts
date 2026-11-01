// SPDX-License-Identifier: Apache-2.0
/**
 * Framework-free rail state store (no cordis, no DOM): folders, pinned ids,
 * projects, memberships, docs, stripes, and rail config, persisted through
 * an injected persistence face. The browser glue binds localStorage today
 * and the host-backed `workspace-rail` settings namespace when its face
 * resolves.
 * @module dsh-workspace-rail/store
 */

import { nextHue } from './palette.ts'
import { isSectionKey, type SectionKey } from './sections.ts'

export const RAIL_SCHEMA_VERSION = 1

export interface FolderRecord {
  id: string
  name: string
  /** 'pixel' = generated monochrome mark, 'emoji' = native emoji char. */
  iconKind: 'pixel' | 'emoji'
  /** Pixel variant name or the emoji character itself. */
  iconValue: string
  /** Pixel marks only: black or white, chosen at creation. */
  iconTone: 'black' | 'white'
  parentId: string | null
  collapsed: boolean
}

export interface ProjectRecord {
  id: string
  name: string
  /** Palette hue key (see palette.ts). */
  hueKey: string
  /** Optional mapping onto an existing DSH workspace. */
  workspaceId: string | null
  /** Per-project opt-in: skip the review card for chats moved INTO this project (still journaled + revertable). */
  autoCarryover: boolean
  /** The project's folder on the server (uploads land here; its AGENTS.md carries the instructions). */
  dir?: string
  /** Project instructions ("perma-prompt"), written to <dir>/AGENTS.md for dsh to apply. */
  instructions?: string
  /** A note for people; never sent to the model. */
  description?: string
  /** Keep a project memory file the assistant reads and updates. */
  memory?: boolean
  /** Answer only from the project's files. */
  strict?: boolean
  /** Model new chats in this project start with (dsh default when absent). */
  model?: { provider: string; model: string; reasoningEffort?: string }
  /** Hidden from the Projects list, kept intact (chats, files, settings). */
  archived?: boolean
}

export interface ProjectDocRecord {
  id: string
  projectId: string
  kind: 'document' | 'snippet' | 'data'
  name: string
  /** Pointer to the real asset - content never rides the browser store. */
  pointer: string
}

/** One applied carryover, kept for one-click revert (newest first). */
export interface CarryoverJournalEntry {
  id: string
  at: number
  sessionId: string
  inverse: {
    membership: string | null
    pointerFixes: Record<string, string>
    restoredDocs: Record<string, ProjectDocRecord>
    removedDocIds: string[]
  }
  summary: string
}

export interface RailState {
  schemaVersion: number
  folders: Record<string, FolderRecord>
  folderOrder: string[]
  projects: Record<string, ProjectRecord>
  projectOrder: string[]
  /** Rail-level pinned session ids (imported from dsh-session-pin, newest first). */
  pinned: string[]
  /** sessionId -> folderId (pinned chats grouped into folders). */
  sessionFolders: Record<string, string>
  /** sessionId -> projectId. */
  memberships: Record<string, string>
  /** entity id (session/folder/project) -> hue key for right-edge stripes. */
  stripes: Record<string, string>
  /** Doc registry keyed by doc id (pointers only). */
  docs: Record<string, ProjectDocRecord>
  /** Carryover journal (newest first, capped at 50 by the engine). */
  journal: CarryoverJournalEntry[]
  /** One-time dsh-session-pin import stamp (epoch ms); null = not yet imported. */
  importedSessionPinAt: number | null
  stripeEdge: 'right' | 'left'
  /** Visible rows per sidebar section (Recents takes the rest). */
  sectionRows: { pinned: number; projects: number }
  /** Sections folded to their header. */
  collapsedSections: string[]
  /** The section filling the whole sidebar (the others show only their headers); null = normal layout. */
  expandedSection: SectionKey | null
  /** Bin: sessionId -> epoch ms it was moved to the bin (hidden everywhere in the rail, restorable). */
  binned: Record<string, number>
  /** How a working chat is marked in the lists. */
  workingIndicator: 'kitty' | 'dots' | 'off'
  /** Browser tab icon (the rail icon) and live title (unread, working, last message); false = the shell's own. */
  tabTitle: boolean
}

export const EMPTY_RAIL_STATE: RailState = {
  schemaVersion: RAIL_SCHEMA_VERSION,
  folders: {},
  folderOrder: [],
  projects: {},
  projectOrder: [],
  pinned: [],
  sessionFolders: {},
  memberships: {},
  stripes: {},
  docs: {},
  journal: [],
  importedSessionPinAt: null,
  stripeEdge: 'right',
  sectionRows: { pinned: 6, projects: 4 },
  collapsedSections: [],
  expandedSection: null,
  binned: {},
  workingIndicator: 'kitty',
  tabTitle: true,
}

/** Minimal persistence face the store persists through. */
export interface RailPersistence {
  load(): RailState | null
  save(state: RailState): void
}

/** In-memory persistence (tests, private-mode fallback). */
export function createMemoryPersistence(initial: RailState | null = null): RailPersistence {
  let state = initial
  return { load: () => state, save: (s) => { state = s } }
}

/** Guarded localStorage persistence (private mode degrades to memory). */
export function createLocalStoragePersistence(key: string): RailPersistence {
  const mem = createMemoryPersistence()
  return {
    load() {
      try {
        const raw = window.localStorage.getItem(key)
        return raw === null ? mem.load() : normalizeRailState(JSON.parse(raw))
      } catch {
        return mem.load()
      }
    },
    save(state) {
      mem.save(state)
      try {
        window.localStorage.setItem(key, JSON.stringify(state))
      } catch {
        /* private mode: in-memory state keeps the session alive */
      }
    },
  }
}

/** Defensive repair of any stored/partial document into a valid RailState. */
export function normalizeRailState(raw: unknown): RailState {
  const src = (raw ?? {}) as Partial<RailState>
  const folders: Record<string, FolderRecord> = {}
  for (const [id, f] of Object.entries(src.folders ?? {})) {
    if (!f || typeof f.id !== 'string' || typeof f.name !== 'string') continue
    folders[id] = {
      id,
      name: f.name,
      iconKind: f.iconKind === 'emoji' ? 'emoji' : 'pixel',
      iconValue: typeof f.iconValue === 'string' ? f.iconValue : 'folder',
      iconTone: f.iconTone === 'white' ? 'white' : 'black',
      parentId: typeof f.parentId === 'string' ? f.parentId : null,
      collapsed: f.collapsed === true,
    }
  }
  const projects: Record<string, ProjectRecord> = {}
  for (const [id, p] of Object.entries(src.projects ?? {})) {
    if (!p || typeof p.id !== 'string' || typeof p.name !== 'string') continue
    projects[id] = {
      id,
      name: p.name,
      hueKey: typeof p.hueKey === 'string' ? p.hueKey : nextHue(Object.values(projects).map(x => x.hueKey)),
      workspaceId: typeof p.workspaceId === 'string' ? p.workspaceId : null,
      autoCarryover: p.autoCarryover === true,
      ...(typeof p.dir === 'string' && p.dir.length > 0 ? { dir: p.dir } : {}),
      ...(typeof p.instructions === 'string' ? { instructions: p.instructions.slice(0, 20_000) } : {}),
      ...(typeof p.description === 'string' ? { description: p.description.slice(0, 2_000) } : {}),
      ...(p.memory === true ? { memory: true } : {}),
      ...(p.strict === true ? { strict: true } : {}),
      ...(p.model !== null && typeof p.model === 'object' && typeof (p.model as { provider?: unknown }).provider === 'string' && typeof (p.model as { model?: unknown }).model === 'string'
        ? { model: { provider: (p.model as { provider: string }).provider, model: (p.model as { model: string }).model, ...(typeof (p.model as { reasoningEffort?: unknown }).reasoningEffort === 'string' ? { reasoningEffort: (p.model as { reasoningEffort: string }).reasoningEffort } : {}) } }
        : {}),
      ...(p.archived === true ? { archived: true } : {}),
    }
  }
  const memberships: Record<string, string> = {}
  for (const [sid, pid] of Object.entries(src.memberships ?? {})) {
    if (typeof sid === 'string' && typeof pid === 'string' && projects[pid] !== undefined) memberships[sid] = pid
  }
  const stripes: Record<string, string> = {}
  for (const [eid, hk] of Object.entries(src.stripes ?? {})) {
    if (typeof eid === 'string' && typeof hk === 'string') stripes[eid] = hk
  }
  const docs: Record<string, ProjectDocRecord> = {}
  for (const [did, d] of Object.entries(src.docs ?? {})) {
    if (!d || typeof d.id !== 'string' || typeof d.projectId !== 'string' || typeof d.name !== 'string') continue
    const kind = d.kind === 'snippet' || d.kind === 'data' ? d.kind : 'document'
    docs[did] = { id: did, projectId: d.projectId, kind, name: d.name, pointer: typeof d.pointer === 'string' ? d.pointer : '' }
  }
  const sessionFolders: Record<string, string> = {}
  for (const [sid, fid] of Object.entries(src.sessionFolders ?? {})) {
    if (typeof sid === 'string' && typeof fid === 'string' && folders[fid] !== undefined) sessionFolders[sid] = fid
  }
  const binned: Record<string, number> = {}
  for (const [sid, at] of Object.entries((src as { binned?: Record<string, unknown> }).binned ?? {})) {
    if (typeof sid === 'string' && typeof at === 'number' && Number.isFinite(at)) binned[sid] = at
  }
  const journal = (Array.isArray(src.journal) ? src.journal : []).filter((e): e is CarryoverJournalEntry =>
    e !== null && typeof e === 'object' && typeof (e as CarryoverJournalEntry).id === 'string' && typeof (e as CarryoverJournalEntry).inverse === 'object')
  return {
    schemaVersion: RAIL_SCHEMA_VERSION,
    folders,
    folderOrder: (Array.isArray(src.folderOrder) ? src.folderOrder : []).filter(id => typeof id === 'string' && folders[id] !== undefined),
    projects,
    projectOrder: (Array.isArray(src.projectOrder) ? src.projectOrder : []).filter(id => typeof id === 'string' && projects[id] !== undefined),
    pinned: (Array.isArray(src.pinned) ? src.pinned : []).filter(id => typeof id === 'string'),
    sessionFolders,
    memberships,
    stripes,
    docs,
    journal,
    importedSessionPinAt: typeof src.importedSessionPinAt === 'number' ? src.importedSessionPinAt : null,
    stripeEdge: src.stripeEdge === 'left' ? 'left' : 'right',
    sectionRows: {
      pinned: clampRows((src as { sectionRows?: { pinned?: unknown } }).sectionRows?.pinned, 6),
      projects: clampRows((src as { sectionRows?: { projects?: unknown } }).sectionRows?.projects, 4),
    },
    collapsedSections: (Array.isArray((src as { collapsedSections?: unknown }).collapsedSections) ? (src as { collapsedSections: unknown[] }).collapsedSections : [])
      .filter((x): x is string => x === 'pinned' || x === 'projects' || x === 'recents'),
    expandedSection: isSectionKey((src as { expandedSection?: unknown }).expandedSection) ? (src as { expandedSection: SectionKey }).expandedSection : null,
    binned,
    workingIndicator: src.workingIndicator === 'dots' || src.workingIndicator === 'off' ? src.workingIndicator : 'kitty',
    tabTitle: (src as { tabTitle?: unknown }).tabTitle !== false,
  }
}

/** Row counts are whole rows between 1 and 30. */
export function clampRows(v: unknown, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback
  return Math.min(30, Math.max(1, n))
}

export interface RailStore {
  getSnapshot(): RailState
  update(mutate: (draft: RailState) => void): RailState
  /** Swap in a whole state (e.g. the host copy once settings load); persist only when asked. */
  replace(next: RailState, persist?: boolean): RailState
  subscribe(listener: () => void): () => void
}

/** Tiny observable store: mutate-through-draft, notify, persist. */
export function createRailStore(persistence: RailPersistence): RailStore {
  let state: RailState = persistence.load() ?? normalizeRailState(EMPTY_RAIL_STATE)
  const listeners = new Set<() => void>()
  const store: RailStore = {
    getSnapshot: () => state,
    update(mutate) {
      const draft = normalizeRailState(state)
      mutate(draft)
      state = draft
      persistence.save(state)
      for (const l of listeners) l()
      return state
    },
    replace(next, persist = false) {
      state = normalizeRailState(next)
      if (persist) persistence.save(state)
      for (const l of listeners) l()
      return state
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
  return store
}