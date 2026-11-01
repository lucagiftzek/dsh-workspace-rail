// SPDX-License-Identifier: Apache-2.0
/**
 * The carryover-and-clean engine (pure): moving a chat into or out of a
 * project produces a REVIEWABLE plan - adds (project docs the chat gains),
 * rebinds (pointers the host rescued via ~ expansion), removes (missing or
 * duplicate pointers) - and applying it journals an inverse for one-click
 * revert. The engine mutates RAIL STATE ONLY: it never writes DSH session
 * internals (model-visible changes are the harness's business, not a UI
 * plugin's). Context sharing is expressed through the project drawer, where
 * the shared doc set + the carryover note live.
 * @module dsh-workspace-rail/carryover
 */
import type { CarryoverJournalEntry, ProjectDocRecord, RailState } from './store.ts'
import type { PointerHealth } from './host/pointer-health.ts'

export type { CarryoverJournalEntry }

export interface PlanItem { docId: string; name: string; pointer: string }
export interface RebindItem { docId: string; name: string; from: string; to: string }
export interface RemoveItem { docId: string; name: string; reason: string }

export interface CarryoverPlan {
  sessionId: string
  fromProjectId: string | null
  toProjectId: string | null
  adds: PlanItem[]
  rebinds: RebindItem[]
  removes: RemoveItem[]
  /** One-paragraph context note shown in the drawer (and copied on demand). */
  note: string
  createdAt: number
}



/**
 * Build the dry-run diff for moving sessionId into toProjectId (null =
 * global default workspace). docHealth is the host-verified pointer map.
 */
export function planCarryover(state: RailState, sessionId: string, toProjectId: string | null, docHealth: Record<string, PointerHealth> = {}): CarryoverPlan {
  if (toProjectId !== null && state.projects[toProjectId] === undefined) throw new Error('unknown project')
  const fromProjectId = state.memberships[sessionId] ?? null
  const targetDocs = toProjectId !== null
    ? Object.values(state.docs).filter(d => d.projectId === toProjectId)
    : []
  const sourceDocs = fromProjectId !== null
    ? Object.values(state.docs).filter(d => d.projectId === fromProjectId)
    : []
  const targetPointers = new Set(targetDocs.map(d => d.pointer))

  // Adds: target project docs the chat gains (healthy ones only).
  const adds: PlanItem[] = toProjectId !== null
    ? targetDocs
        .filter(d => (docHealth[d.id]?.status ?? 'ok') === 'ok')
        .map(d => ({ docId: d.id, name: d.name, pointer: d.pointer }))
    : []

  // Rebinds: host rescued pointers (~ expansion) inside the target project.
  const rebinds: RebindItem[] = targetDocs
    .filter(d => docHealth[d.id]?.repaired !== undefined)
    .map(d => ({ docId: d.id, name: d.name, from: d.pointer, to: docHealth[d.id]!.repaired! }))

  // Removes: missing pointers among the session's CURRENT project docs
  // (leaving them behind is the "trim redundant memory" step), plus exact
  // duplicates inside the target project (same pointer registered twice -
  // keep the first by insertion id order).
  const removes: RemoveItem[] = []
  for (const d of sourceDocs) {
    if (docHealth[d.id]?.status === 'missing') removes.push({ docId: d.id, name: d.name, reason: 'pointer missing on disk' })
  }
  const seen = new Set<string>()
  for (const d of targetDocs) {
    if (targetPointers.has(d.pointer) && seen.has(d.pointer)) {
      const first = targetDocs.find(x => x.pointer === d.pointer)
      removes.push({ docId: d.id, name: d.name, reason: 'duplicate of ' + (first?.name ?? d.pointer) })
    }
    seen.add(d.pointer)
  }
  const targetName = toProjectId !== null ? (state.projects[toProjectId]?.name ?? toProjectId) : 'the global default workspace'
  const note = 'Moved into ' + targetName + ' with ' + adds.length + ' shared doc(s) in scope'
    + (rebinds.length > 0 ? ', ' + rebinds.length + ' pointer(s) rebound' : '')
    + (removes.length > 0 ? ', ' + removes.length + ' stale doc(s) trimmed' : '') + '.'

  return { sessionId, fromProjectId, toProjectId, adds, rebinds, removes, note, createdAt: Date.now() }
}

/**
 * Apply a confirmed plan: membership change, pointer rebinds, doc removals,
 * journal entry (inverse kept for revert). Returns the changed rail fields.
 */
export function applyCarryover(state: RailState, plan: CarryoverPlan): Pick<RailState, 'memberships' | 'docs' | 'journal'> {
  const memberships = { ...state.memberships }
  if (plan.sessionId !== '') {
    if (plan.toProjectId === null) delete memberships[plan.sessionId]
    else memberships[plan.sessionId] = plan.toProjectId
  }
  const docs = { ...state.docs }
  const pointerFixes: Record<string, string> = {}
  const removedDocIds: string[] = []
  for (const r of plan.rebinds) {
    const doc = docs[r.docId]
    if (doc !== undefined) { pointerFixes[r.docId] = doc.pointer; docs[r.docId] = { ...doc, pointer: r.to } }
  }
  const restoredDocs: RailState['docs'] = {}
  for (const r of plan.removes) {
    const doc = docs[r.docId]
    if (doc !== undefined) { restoredDocs[r.docId] = doc; delete docs[r.docId]; removedDocIds.push(r.docId) }
  }
  const entry: CarryoverJournalEntry = {
    id: 'j_' + plan.createdAt.toString(36) + '_' + Math.random().toString(36).slice(2, 7),
    at: plan.createdAt,
    sessionId: plan.sessionId,
    inverse: { membership: plan.fromProjectId, pointerFixes, restoredDocs, removedDocIds },
    summary: plan.note,
  }
  const journal = [entry, ...state.journal].slice(0, 50)
  return { memberships, docs, journal }
}

/**
 * Revert the most recent journal entry (or a specific id): restore
 * membership, pointers, and removed docs; drop the entry. Returns null when
 * the journal is empty or the id is unknown.
 */
export function revertCarryover(state: RailState, entryId?: string | null): Pick<RailState, 'memberships' | 'docs' | 'journal'> | null {
  const idx = entryId === undefined || entryId === null
    ? 0
    : state.journal.findIndex(e => e.id === entryId)
  const entry = state.journal[idx]
  if (entry === undefined) return null
  const memberships = { ...state.memberships }
  if (entry.inverse.membership === null) delete memberships[entry.sessionId]
  else memberships[entry.sessionId] = entry.inverse.membership
  const docs = { ...state.docs }
  for (const [docId, oldPointer] of Object.entries(entry.inverse.pointerFixes)) {
    const doc = docs[docId]
    if (doc !== undefined) docs[docId] = { ...doc, pointer: oldPointer }
  }
  for (const docId of entry.inverse.removedDocIds) {
    const doc = entry.inverse.restoredDocs[docId]
    if (doc !== undefined) docs[docId] = doc
  }
  const journal = state.journal.filter(e => e.id !== entry.id)
  return { memberships, docs, journal }
}

/** Duplicate-pointer scan within one project (usable without a transfer). */
export function duplicateDocIds(state: RailState, projectId: string): string[] {
  const seen = new Set<string>()
  const dupes: string[] = []
  for (const d of Object.values(state.docs).filter(d => d.projectId === projectId)) {
    if (seen.has(d.pointer)) dupes.push(d.id)
    else seen.add(d.pointer)
  }
  return dupes
}
/**
 * Project-level cleanup plan (no transfer): rebind host-rescued pointers and
 * trim missing/duplicate docs for one project. sessionId is empty - no
 * membership changes; the journal still records the inverse.
 */
export function planProjectCleanup(state: RailState, projectId: string, docHealth: Record<string, PointerHealth> = {}): CarryoverPlan {
  if (state.projects[projectId] === undefined) throw new Error('unknown project')
  const docs = Object.values(state.docs).filter(d => d.projectId === projectId)
  const rebinds: RebindItem[] = docs
    .filter(d => docHealth[d.id]?.repaired !== undefined)
    .map(d => ({ docId: d.id, name: d.name, from: d.pointer, to: docHealth[d.id]!.repaired! }))
  const removes: RemoveItem[] = []
  for (const d of docs) {
    if (docHealth[d.id]?.status === 'missing') removes.push({ docId: d.id, name: d.name, reason: 'pointer missing on disk' })
  }
  const seen = new Set<string>()
  for (const d of docs) {
    if (seen.has(d.pointer)) removes.push({ docId: d.id, name: d.name, reason: 'duplicate pointer' })
    seen.add(d.pointer)
  }
  return {
    sessionId: '',
    fromProjectId: projectId,
    toProjectId: projectId,
    adds: [],
    rebinds,
    removes,
    note: 'Cleanup of ' + (state.projects[projectId]?.name ?? projectId) + ': ' + rebinds.length + ' rebinding(s), ' + removes.length + ' trim(s).',
    createdAt: Date.now(),
  }
}