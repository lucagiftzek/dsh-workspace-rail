// SPDX-License-Identifier: Apache-2.0
/**
 * Live Recents order (pure, no DOM, no cordis): newest COMPLETED turn first.
 *
 * The host's session list carries `updatedAt` = the last human prompt (or the
 * creation time) and keeps the order it had when the list was fetched; it
 * never reorders by itself. What it does push live, for every chat, is the
 * running flag (`api-session/status`). A running -> idle edge is a finished
 * turn, so the tracker stamps it and Recents sorts by:
 *
 * - idle chat: max(last observed completion, last prompt time)
 * - running chat: the key it had before the turn started, or when it was first
 *   seen running (it moves when the turn completes, not when it starts or
 *   when a follow-up prompt lands mid-turn).
 *
 * Completion stamps are kept in browser storage (capped), so a reload keeps
 * the order. Nothing here talks to the server: no polling, no extra load.
 * @module dsh-workspace-rail/recents-order
 */

export interface ActivityRow {
  id: string
  running: boolean
  /** Host `updatedAt` (last prompt or creation, epoch ms). */
  updatedAt?: number
}

export interface ActivityTracker {
  /** Feed the current rows; true when a completion was stamped. */
  observe(rows: Iterable<ActivityRow>): boolean
  /** Sort key (epoch ms) for a row, after observe(). */
  keyOf(row: ActivityRow): number
  completedAt(id: string): number | undefined
}

export interface ActivityTrackerOptions {
  now?: () => number
  load?: () => Record<string, number> | null
  save?: (stamps: Record<string, number>) => void
  /** Max stamps kept (newest win). */
  cap?: number
}

export function createActivityTracker(opts: ActivityTrackerOptions = {}): ActivityTracker {
  const now = opts.now ?? Date.now
  const cap = opts.cap ?? 500
  const completed = new Map<string, number>()
  try {
    for (const [id, at] of Object.entries(opts.load?.() ?? {})) {
      if (typeof at === 'number' && Number.isFinite(at)) completed.set(id, at)
    }
  } catch { /* unreadable storage: start empty */ }
  const lastRunning = new Map<string, boolean>()
  /** The prompt time seen while the chat was last idle (the host may bump it before the running flag arrives). */
  const lastPrompt = new Map<string, number>()
  /** The idle key a chat had when its current turn started. */
  const frozen = new Map<string, number>()
  const idleKey = (row: ActivityRow): number => Math.max(completed.get(row.id) ?? 0, row.updatedAt ?? 0)

  const persist = (): void => {
    if (opts.save === undefined) return
    let entries = [...completed.entries()]
    if (entries.length > cap) {
      entries = entries.sort((a, b) => b[1] - a[1]).slice(0, cap)
      completed.clear()
      for (const [id, at] of entries) completed.set(id, at)
    }
    try { opts.save(Object.fromEntries(entries)) } catch { /* storage full or blocked */ }
  }

  return {
    observe(rows) {
      let stamped = false
      const t = now()
      for (const row of rows) {
        const prev = lastRunning.get(row.id)
        if (prev === true && !row.running) {
          completed.set(row.id, Math.max(t, completed.get(row.id) ?? 0))
          frozen.delete(row.id)
          stamped = true
        } else if (prev !== true && row.running && !frozen.has(row.id)) {
          // Started (or first seen) running: hold its place until the turn completes.
          frozen.set(row.id, idleKey({ ...row, updatedAt: lastPrompt.get(row.id) ?? row.updatedAt }))
        }
        lastRunning.set(row.id, row.running)
        if (!row.running) lastPrompt.set(row.id, row.updatedAt ?? 0)
      }
      if (stamped) persist()
      return stamped
    },
    keyOf(row) {
      if (row.running) {
        const f = frozen.get(row.id)
        if (f !== undefined) return f
        const c = completed.get(row.id)
        return c !== undefined ? c : (row.updatedAt ?? 0)
      }
      return idleKey(row)
    },
    completedAt: id => completed.get(id),
  }
}

/** Stable newest-first order by key (ties keep the incoming order). */
export function orderByActivity<T>(items: readonly T[], keyOf: (item: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index, key: keyOf(item) }))
    .sort((a, b) => (b.key - a.key) || (a.index - b.index))
    .map(x => x.item)
}

/**
 * What the rail SHOWS from the catalog, as one string: when it is unchanged
 * the update is a no-op (no redraw, so no flicker, lost hover or focus).
 * Covers order, titles, blank, the minute of last activity and the working
 * flag, plus the open chat and the bin size.
 */
export function catalogSignature(
  catalog: readonly { id: string; title: string; blank: boolean; updatedAt?: number }[],
  currentId: string | null,
  binCount: number,
  running: ReadonlySet<string>,
  limit = 400,
): string {
  let sig = String(currentId) + '|' + catalog.length + '|bin' + binCount
  for (let i = 0; i < catalog.length && i < limit; i++) {
    const e = catalog[i]!
    sig += '|' + e.id + '\u0001' + e.title + (e.blank ? '\u0002' : '') + Math.floor((e.updatedAt ?? 0) / 60_000) + (running.has(e.id) ? '\u0003' : '')
  }
  return sig
}
