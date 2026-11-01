// SPDX-License-Identifier: Apache-2.0
/**
 * Project workspace ops (pure): create/rename/delete projects, doc registry
 * (pointers only, blobs never ride the browser store), membership routing
 * (the state the P4 carryover pipeline consumes).
 * @module dsh-workspace-rail/projects
 */

import { nextHue } from './palette.ts'
import type { RailState } from './store.ts'

export type DocKind = 'document' | 'snippet' | 'data'

export interface ProjectDocRecord {
  id: string
  projectId: string
  kind: DocKind
  name: string
  /** Pointer to the real asset (host path / URL), never the content. */
  pointer: string
}

/** Create a project; hue rotates through unused palette keys. */
export function createProject(state: RailState, name: string): Pick<RailState, 'projects' | 'projectOrder'> {
  const trimmed = name.trim()
  if (trimmed.length === 0) throw new Error('project name required')
  const id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  const hueKey = nextHue(Object.values(state.projects).map(p => p.hueKey))
  const projects = { ...state.projects }
  projects[id] = { id, name: trimmed, hueKey, workspaceId: null, autoCarryover: false }
  return { projects, projectOrder: [...state.projectOrder, id] }
}

/** Delete a project; member chats return to the global default workspace. */
export function deleteProject(state: RailState, projectId: string): Pick<RailState, 'projects' | 'projectOrder' | 'memberships' | 'docs'> {
  if (state.projects[projectId] === undefined) return state
  const projects = { ...state.projects }
  delete projects[projectId]
  const memberships = { ...state.memberships }
  for (const [sid, pid] of Object.entries(memberships)) {
    if (pid === projectId) delete memberships[sid]
  }
  const docs: RailState['docs'] = {}
  for (const [did, d] of Object.entries(state.docs)) {
    if (d.projectId !== projectId) docs[did] = d
  }
  return { projects, projectOrder: state.projectOrder.filter(id => id !== projectId), memberships, docs }
}

/** Rename a project. */
export function renameProject(state: RailState, projectId: string, name: string): Pick<RailState, 'projects'> {
  const p = state.projects[projectId]
  if (p === undefined) return state
  const trimmed = name.trim()
  if (trimmed.length === 0) throw new Error('project name required')
  return { projects: { ...state.projects, [projectId]: { ...p, name: trimmed } } }
}

/**
 * Route a session into a project (or back to the global default workspace
 * with projectId null). P4 wraps this with the carryover dry-run.
 */
export function moveSessionToProject(state: RailState, sessionId: string, projectId: string | null): Pick<RailState, 'memberships'> {
  if (projectId !== null && state.projects[projectId] === undefined) throw new Error('unknown project')
  const memberships = { ...state.memberships }
  if (projectId === null) delete memberships[sessionId]
  else memberships[sessionId] = projectId
  return { memberships }
}

/** Add a project doc (pointer only). */
export function addDoc(state: RailState, projectId: string, kind: DocKind, name: string, pointer: string): Pick<RailState, 'docs'> {
  if (state.projects[projectId] === undefined) throw new Error('unknown project')
  const trimmed = name.trim()
  if (trimmed.length === 0) throw new Error('doc name required')
  const id = `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  return { docs: { ...state.docs, [id]: { id, projectId, kind, name: trimmed, pointer: pointer.trim() } } }
}

/** Remove a project doc. */
export function removeDoc(state: RailState, docId: string): Pick<RailState, 'docs'> {
  const docs = { ...state.docs }
  delete docs[docId]
  return { docs }
}

/** List a project's docs sorted by kind then name. */
export function listDocs(state: RailState, projectId: string): ProjectDocRecord[] {
  return Object.values(state.docs)
    .filter(d => d.projectId === projectId)
    .sort((a, b) => (a.kind !== b.kind ? a.kind.localeCompare(b.kind) : a.name.localeCompare(b.name)))
}

/** Member session ids of a project. */
export function projectMembers(state: RailState, projectId: string): string[] {
  return Object.entries(state.memberships).filter(([, pid]) => pid === projectId).map(([sid]) => sid)
}