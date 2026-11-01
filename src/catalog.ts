// SPDX-License-Identifier: Apache-2.0
/**
 * Session catalog: a flattened, host-ordered slice of the sessions and
 * workspaces lists. The host returns ids newest-first, so the catalog's
 * natural order IS the Recents order, no timestamp plumbing needed at P0.
 * Pure functions only (testable without the client runtime).
 * @module dsh-workspace-rail/catalog
 */

export interface CatalogEntry {
  id: string
  title: string
  workspaceId: string | null
  blank: boolean
  /** Last activity (epoch ms) when the host reports it; drives the age column. */
  updatedAt?: number
  /** The chat's working folder (a project folder makes it a project chat). */
  cwd?: string
}

export interface CatalogDiff {
  added: CatalogEntry[]
  removed: CatalogEntry[]
  changed: CatalogEntry[]
}

/** Diff two catalog snapshots by id; title/workspace/blank changes count as changed. */
export function diffCatalog(prev: readonly CatalogEntry[], next: readonly CatalogEntry[]): CatalogDiff {
  const prevById = new Map(prev.map(e => [e.id, e]))
  const nextById = new Map(next.map(e => [e.id, e]))
  const added: CatalogEntry[] = []
  const removed: CatalogEntry[] = []
  const changed: CatalogEntry[] = []
  for (const e of next) {
    const p = prevById.get(e.id)
    if (p === undefined) { added.push(e); continue }
    if (p.title !== e.title || p.workspaceId !== e.workspaceId || p.blank !== e.blank) changed.push(e)
  }
  for (const e of prev) if (!nextById.has(e.id)) removed.push(e)
  return { added, removed, changed }
}

export type RepeatKind = 'none' | 'pinned' | 'project'

export interface RecentRow extends CatalogEntry {
  /** Dual-registration state shown in Recents. */
  repeat: RepeatKind
  /** Stripe hue key carried into Recents repeats (undefined = no stripe). */
  hueKey?: string
}

export interface RecentsOptions {
  /** Pinned session ids (pin level 1; folder membership implies pinned too). */
  pinnedIds: readonly string[]
  /** sessionId -> projectId. */
  memberships: Readonly<Record<string, string>>
  /** projectId -> record (for the project's hue). */
  projects: Readonly<Record<string, { hueKey: string }>>
  /** Explicit per-session stripe overrides win over project hue. */
  stripes: Readonly<Record<string, string>>
  /** Drop blank/placeholder sessions from the feed (default true). */
  includeBlank?: boolean
}

/**
 * Build the Recents feed: strict chronological (host order), with pinned and
 * projected chats repeating in place, keeping their right stripe and showing
 * an explicit dual-registration indicator.
 */
export function buildRecents(entries: readonly CatalogEntry[], opts: RecentsOptions): RecentRow[] {
  const pinned = new Set(opts.pinnedIds)
  const includeBlank = opts.includeBlank ?? false
  const rows: RecentRow[] = []
  for (const e of entries) {
    if (!includeBlank && e.blank) continue
    const projectId = opts.memberships[e.id]
    const project = projectId !== undefined ? opts.projects[projectId] : undefined
    const explicitStripe = opts.stripes[e.id]
    const repeat: RepeatKind = pinned.has(e.id) ? 'pinned' : project !== undefined ? 'project' : 'none'
    const hueKey = explicitStripe ?? (project !== undefined ? project.hueKey : undefined)
    rows.push({ ...e, repeat, hueKey })
  }
  return rows
}
