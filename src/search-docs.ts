// SPDX-License-Identifier: Apache-2.0
/**
 * SearchDoc construction from rail state + catalog + transcript windows
 * (pure; the panel consumes this, tests rank it end-to-end).
 * @module dsh-workspace-rail/search-docs
 */
import type { CatalogEntry } from './catalog.ts'
import type { RailState } from './store.ts'
import type { SearchDoc } from './scoring.ts'

export type WindowMap = Record<string, { f?: string[]; l?: string[] }>

/**
 * Build one SearchDoc per catalog entry. Recency proxy: the host returns ids
 * newest-first, so the index becomes a 1-minute-per-rank synthetic timestamp
 * - among equal tiers this preserves the host's own ordering. Folder names
 * count as tier 1 for their member chats; project titles and doc names for
 * project members (tier 1 / tier 2 respectively).
 */
export function buildSearchDocs(entries: readonly CatalogEntry[], state: RailState, windows: WindowMap, now = Date.now()): SearchDoc[] {
  return entries.map((e, idx) => {
    const folderId = state.sessionFolders[e.id]
    const folder = folderId !== undefined ? state.folders[folderId] : undefined
    const projectId = state.memberships[e.id]
    const project = projectId !== undefined ? state.projects[projectId] : undefined
    const docNames = projectId !== undefined
      ? Object.values(state.docs).filter(d => d.projectId === projectId).map(d => d.name)
      : []
    const win = windows[e.id]
    return {
      id: e.id,
      title: e.title,
      folderNames: folder !== undefined ? [folder.name] : [],
      projectTitle: project !== undefined ? project.name : undefined,
      docNames,
      tags: [],
      firstMsgs: win?.f ?? [],
      lastMsgs: win?.l ?? [],
      lastUsed: now - idx * 60_000,
      pinned: state.pinned.includes(e.id) || state.sessionFolders[e.id] !== undefined || state.memberships[e.id] !== undefined,
    }
  })
}
