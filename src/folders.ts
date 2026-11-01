// SPDX-License-Identifier: Apache-2.0
/**
 * Pinned-section tree ops (pure): folders nest ONE level (design note 9.2,

 * two levels cost more tree logic than a 300px sidebar buys), pinned chats
 * may live standalone or inside folders, and deleting a folder keeps its
 * chats pinned (ungrouped), never unpinned.
 * @module dsh-workspace-rail/folders
 */

import { isPixelVariant, type PixelTone } from './pixel-icons.ts'
import type { RailState } from './store.ts'

export interface CreateFolderInput {
  name: string
  iconKind: 'pixel' | 'emoji'
  iconValue: string
  iconTone?: PixelTone
  parentId?: string | null
}

/** Create a folder; enforces one-level nesting and returns the new state fields. */
export function createFolder(state: RailState, input: CreateFolderInput): Pick<RailState, 'folders' | 'folderOrder'> {
  const name = input.name.trim()
  if (name.length === 0) throw new Error('folder name required')
  let parentId: string | null = null
  if (input.parentId !== undefined && input.parentId !== null) {
    const parent = state.folders[input.parentId]
    if (parent === undefined) throw new Error('unknown parent folder')
    if (parent.parentId !== null) throw new Error('nesting is limited to one level')
    parentId = input.parentId
  }
  const id = `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  const folders = { ...state.folders }
  folders[id] = {
    id,
    name,
    iconKind: input.iconKind === 'emoji' ? 'emoji' : 'pixel',
    iconValue: input.iconKind === 'pixel' && !isPixelVariant(input.iconValue) ? 'folder' : input.iconValue,
    iconTone: input.iconTone === 'white' ? 'white' : 'black',
    parentId,
    collapsed: false,
  }
  const folderOrder = [...state.folderOrder, id]
  return { folders, folderOrder }
}

/** One visible row of the Pinned section (flattened, collapse-aware). */
export interface PinnedRow {
  kind: 'folder' | 'session'
  id: string
  name: string
  indent: 0 | 1
  collapsed?: boolean
  /** For sessions: the folder id when grouped, else null. */
  folderId?: string | null
}

/**
 * Flatten the Pinned tree: root folders + subfolders + standalone pinned
 * chats (spec order: folders first, then standalone chats, host order kept).
 */
export function buildPinnedRows(state: RailState, sessionTitle: (id: string) => string): PinnedRow[] {
  const rows: PinnedRow[] = []
  const inFolders = new Set(Object.keys(state.sessionFolders))
  const rootIds = state.folderOrder.filter(id => state.folders[id]?.parentId === null)
  for (const fid of rootIds) {
    const folder = state.folders[fid]
    if (folder === undefined) continue
    rows.push({ kind: 'folder', id: fid, name: folder.name, indent: 0, collapsed: folder.collapsed })
    if (folder.collapsed) continue
    for (const sid of state.folderOrder) {
      const sub = state.folders[sid]
      if (sub !== undefined && sub.parentId === fid) {
        rows.push({ kind: 'folder', id: sid, name: sub.name, indent: 1, collapsed: sub.collapsed })
        if (sub.collapsed) continue
        for (const [sid2, folderId] of Object.entries(state.sessionFolders)) {
          if (folderId === sid) rows.push(sessionRow(sid2, sessionTitle(sid2), sid, 1))
        }
      }
    }
    for (const [sid, folderId] of Object.entries(state.sessionFolders)) {
      if (folderId === fid) rows.push(sessionRow(sid, sessionTitle(sid), fid, 1))
    }
  }
  for (const sid of state.pinned) {
    if (inFolders.has(sid)) continue
    rows.push(sessionRow(sid, sessionTitle(sid), null))
  }
  return rows
}

function sessionRow(id: string, title: string, folderId: string | null, indent: 0 | 1 = 0): PinnedRow {
  return { kind: 'session', id, name: title, indent, folderId }
}

/** Unpin a session entirely (rail pin list + folder membership). */
export function unpinSession(state: RailState, sessionId: string): Pick<RailState, 'pinned' | 'sessionFolders'> {
  const pinned = state.pinned.filter(id => id !== sessionId)
  const sessionFolders = { ...state.sessionFolders }
  delete sessionFolders[sessionId]
  return { pinned, sessionFolders }
}

/** Delete a folder: subfolders/promoted members fall back, chats stay pinned. */
export function deleteFolder(state: RailState, folderId: string): Pick<RailState, 'folders' | 'folderOrder' | 'sessionFolders'> {
  const folder = state.folders[folderId]
  if (folder === undefined) return state
  const folders = { ...state.folders }
  const sessionFolders = { ...state.sessionFolders }
  delete folders[folderId]
  for (const [sid, fid] of Object.entries(sessionFolders)) {
    if (fid === folderId) delete sessionFolders[sid]
  }
  if (folder.parentId === null) {
    // Promote one-level children to roots, keep their members.
    for (const f of Object.values(folders)) {
      if (f.parentId === folderId) {
        folders[f.id] = { ...f, parentId: null }
      }
    }
  }
  const folderOrder = state.folderOrder.filter(id => folders[id] !== undefined)
  return { folders, folderOrder, sessionFolders }
}

/** Toggle a folder's collapsed flag. */
export function toggleFolderCollapsed(state: RailState, folderId: string): Pick<RailState, 'folders'> {
  const folder = state.folders[folderId]
  if (folder === undefined) return state
  return { folders: { ...state.folders, [folderId]: { ...folder, collapsed: !folder.collapsed } } }
}

/** Move a pinned chat into (or out of, with folderId null) a folder. */
export function assignSessionFolder(state: RailState, sessionId: string, folderId: string | null): Pick<RailState, 'pinned' | 'sessionFolders'> {
  const pinned = state.pinned.includes(sessionId) ? state.pinned : [sessionId, ...state.pinned]
  if (folderId === null) {
    const sessionFolders = { ...state.sessionFolders }
    delete sessionFolders[sessionId]
    return { pinned, sessionFolders }
  }
  if (state.folders[folderId] === undefined) throw new Error('unknown folder')
  return { pinned, sessionFolders: { ...state.sessionFolders, [sessionId]: folderId } }
}

/** Where a dragged pinned chat lands. */
export type PinnedDropTarget =
  | { kind: 'session'; id: string; after: boolean }
  | { kind: 'folder'; id: string }
  | { kind: 'end' }

/**
 * Drag-and-drop for pinned chats: reorder among standalone chats, reorder
 * inside a folder, move into a folder (appended), or out of it (before/after a
 * standalone chat, or to the end of the standalone list). Folder membership
 * order lives in the key order of `sessionFolders`, standalone order in `pinned`.
 */
export function movePinnedSession(state: RailState, sessionId: string, target: PinnedDropTarget): Pick<RailState, 'pinned' | 'sessionFolders'> {
  const unchanged = { pinned: state.pinned, sessionFolders: state.sessionFolders }
  const pinned0 = state.pinned.includes(sessionId) ? state.pinned : [sessionId, ...state.pinned]
  const entries = Object.entries(state.sessionFolders).filter(([k]) => k !== sessionId)
  let pinned = pinned0
  if (target.kind === 'folder') {
    if (state.folders[target.id] === undefined) return unchanged
    entries.push([sessionId, target.id])
  } else if (target.kind === 'end') {
    pinned = [...pinned0.filter(x => x !== sessionId), sessionId]
  } else {
    if (target.id === sessionId) return unchanged
    const folderId = state.sessionFolders[target.id]
    if (folderId !== undefined) {
      const idx = entries.findIndex(([k]) => k === target.id)
      if (idx < 0) return unchanged
      entries.splice(idx + (target.after ? 1 : 0), 0, [sessionId, folderId])
    } else {
      const rest = pinned0.filter(x => x !== sessionId)
      const idx = rest.indexOf(target.id)
      if (idx < 0) rest.push(sessionId)
      else rest.splice(idx + (target.after ? 1 : 0), 0, sessionId)
      pinned = rest
    }
  }
  return { pinned, sessionFolders: Object.fromEntries(entries) }
}

/** Reorder a folder next to a sibling (same parent only); otherwise unchanged. */
export function moveFolder(state: RailState, folderId: string, targetId: string, after: boolean): string[] {
  const f = state.folders[folderId]
  const t = state.folders[targetId]
  if (f === undefined || t === undefined || folderId === targetId || f.parentId !== t.parentId) return state.folderOrder
  const order = state.folderOrder.filter(x => x !== folderId)
  const idx = order.indexOf(targetId)
  if (idx < 0) return state.folderOrder
  order.splice(idx + (after ? 1 : 0), 0, folderId)
  return order
}

/** Move `id` before/after `targetId` in a plain id list (projects). */
export function reorderIds(order: readonly string[], id: string, targetId: string, after: boolean): string[] {
  if (id === targetId || !order.includes(id) || !order.includes(targetId)) return [...order]
  const rest = order.filter(x => x !== id)
  const idx = rest.indexOf(targetId)
  rest.splice(idx + (after ? 1 : 0), 0, id)
  return rest
}
