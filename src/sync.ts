// SPDX-License-Identifier: Apache-2.0
/**
 * Browser <-> host sync for rail state over the rail's own API
 * (/workspace-rail/api/state). Replaces the settings-namespace path, which is
 * memory-only for every non-loopback browser (the public GUI host), so state
 * written there never left the tab.
 *
 * - hydrate(): GET the host copy; MERGE in anything this browser holds that
 *   the host lacks (recovers data stranded in browser storage), push if the
 *   merge added something, then adopt.
 * - save(): debounced PUT with the last seen revision; a 409 (another tab or
 *   device wrote first) adopts the host copy instead of clobbering it.
 * - refresh(): re-read when the tab regains focus / on an idle interval.
 * Nothing is written before hydrate() finishes.
 * @module dsh-workspace-rail/sync
 */
import { normalizeRailState, type RailState } from './store.ts'

export const API_BASE = '/workspace-rail/api'
const MARKER = 'dsh-workspace-rail'

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string | Blob | ArrayBuffer; credentials?: 'same-origin' }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

/** Union merge: host wins per key; browser-only keys and pins are added. */
export function mergeRailStates(host: RailState, local: RailState): { merged: RailState; added: number } {
  const out = normalizeRailState(host)
  let added = 0
  const dicts = ['folders', 'projects', 'sessionFolders', 'memberships', 'stripes', 'docs'] as const
  for (const k of dicts) {
    const h = out[k] as Record<string, unknown>
    for (const [id, v] of Object.entries(local[k] as Record<string, unknown>)) {
      if (!(id in h)) { h[id] = v; added++ }
    }
  }
  for (const id of local.pinned) if (!out.pinned.includes(id)) { out.pinned.push(id); added++ }
  for (const id of local.folderOrder) if (!out.folderOrder.includes(id) && out.folders[id] !== undefined) out.folderOrder.push(id)
  for (const id of local.projectOrder) if (!out.projectOrder.includes(id) && out.projects[id] !== undefined) out.projectOrder.push(id)
  // Memberships pointing at a project that exists nowhere are dropped.
  for (const [sid, pid] of Object.entries(out.memberships)) if (out.projects[pid] === undefined) delete out.memberships[sid]
  if (out.importedSessionPinAt === null && local.importedSessionPinAt !== null) out.importedSessionPinAt = local.importedSessionPinAt
  return { merged: out, added }
}

export interface RailSync {
  readonly ready: boolean
  hydrate(local: RailState): Promise<RailState | null>
  save(state: RailState): void
  refresh(): Promise<RailState | null>
  flush(): Promise<void>
}

export function createRailSync(opts: {
  fetch: FetchLike
  /** Called when the host copy should replace the in-memory state (409 / refresh). */
  adopt: (state: RailState) => void
  warn?: (m: string) => void
  debounceMs?: number
}): RailSync {
  let ready = false
  let rev: number | undefined
  let pending: RailState | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let inflight: Promise<void> | null = null
  const debounce = opts.debounceMs ?? 400
  const jsonHeaders = { 'content-type': 'application/json', 'x-requested-with': MARKER, accept: 'application/json' }

  async function get(): Promise<{ rev: number; state: RailState | null } | null> {
    try {
      const r = await opts.fetch(API_BASE + '/state', { credentials: 'same-origin', headers: { accept: 'application/json' } })
      if (!r.ok) { opts.warn?.('workspace-rail: state read failed (' + r.status + ')'); return null }
      const body = await r.json() as { rev?: number; state?: unknown }
      return { rev: typeof body.rev === 'number' ? body.rev : 0, state: body.state === null || body.state === undefined ? null : normalizeRailState(body.state) }
    } catch (error) {
      opts.warn?.('workspace-rail: state read failed: ' + String(error))
      return null
    }
  }

  async function put(state: RailState): Promise<void> {
    const r = await opts.fetch(API_BASE + '/state', {
      method: 'PUT', credentials: 'same-origin', headers: jsonHeaders,
      body: JSON.stringify({ baseRev: rev, state }),
    })
    const body = await r.json().catch(() => ({})) as { rev?: number; state?: unknown; error?: string }
    if (r.status === 409) {
      rev = body.rev
      if (body.state !== null && body.state !== undefined) opts.adopt(normalizeRailState(body.state))
      return
    }
    if (!r.ok) { opts.warn?.('workspace-rail: save failed (' + r.status + '): ' + String(body.error ?? '')); return }
    rev = body.rev
  }

  function schedule(): void {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; void run() }, debounce)
  }
  async function run(): Promise<void> {
    if (inflight !== null) { await inflight; if (pending !== null) schedule(); return }
    const s = pending
    pending = null
    if (s === null) return
    inflight = put(s).catch(error => { opts.warn?.('workspace-rail: save failed: ' + String(error)) }).finally(() => { inflight = null })
    await inflight
  }

  return {
    get ready() { return ready },
    async hydrate(local) {
      const host = await get()
      if (host === null) return null
      rev = host.rev
      const base = host.state ?? normalizeRailState({})
      const { merged, added } = mergeRailStates(base, local)
      ready = true
      if (added > 0 || host.state === null) { pending = merged; await run() }
      return merged
    },
    save(state) {
      if (!ready) return
      pending = state
      schedule()
    },
    async refresh() {
      if (!ready || pending !== null || inflight !== null || timer !== null) return null
      const host = await get()
      if (host === null || host.rev === rev || host.state === null) return null
      rev = host.rev
      return host.state
    },
    async flush() {
      if (timer !== null) { clearTimeout(timer); timer = null }
      await run()
    },
  }
}
