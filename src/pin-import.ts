// SPDX-License-Identifier: Apache-2.0
/**
 * Read the pins (and colors) to seed the rail's one-time, read-only pin
 * import. The same client bundle runs on two DSH lines:
 *
 * - DSH 0.1.5: the `settingsScope` client service binds the `session-pin`
 *   namespace (session-pin 0.7.x registers it on the host). This path is the
 *   rail's original behaviour and is used unchanged whenever that service exists.
 * - DSH 0.2.x: there is no `settingsScope`. Session pinning is native (the
 *   host's workspace registry; the client `workspaces` list carries
 *   `pinnedSessionIds`, most recently pinned first), and dsh-session-pin is
 *   retired. The native set is read first. Only when it is empty or unknown is
 *   a still-installed dsh-session-pin consulted: its loader entry `session-pin`
 *   (live fields `pinned`, `colors`) through the `remote.settings` RPC
 *   (`describe()`). Nothing depends on that entry existing.
 *
 * Either way the browser-local copy dsh-session-pin kept is the last fallback.
 * @module dsh-workspace-rail/pin-import
 */

/** dsh-session-pin's browser-local fallback key (pin-store.ts STORAGE_KEY). */
export const SESSION_PIN_LOCAL_KEY = 'dsh.session-pin.pinned'
/** Settings namespace on 0.1.5 and loader entry id on 0.2.x (identical). */
export const SESSION_PIN_NS = 'session-pin'

export interface ImportedPins { pinned: string[]; colors: Record<string, string> }

/** The bound settings-scope face (session-pin's PinScope shape, DSH 0.1.5). */
export interface BoundScopeLike {
  getSnapshot?(): unknown
  set?(field: string, value: unknown): Promise<void> | void
}
/** The 0.1.5 `settingsScope` client service. */
export interface SettingsScopeLike {
  bind?<T>(opts: { namespace: string }): T
}
/** The `remote.settings` RPC face (both lines): result envelopes, never throws by contract. */
export interface RemoteSettingsLike {
  describe(): Promise<{ ok: boolean; value?: { namespaces?: unknown }; error?: { code?: string; message?: string } }>
}
/** The slice of Web Storage the fallback reads. */
export interface StorageLike { getItem(key: string): string | null }

export function normalizePins(pinned: unknown, colors: unknown): ImportedPins {
  const ids = Array.isArray(pinned) ? pinned.filter((x): x is string => typeof x === 'string') : []
  const colorMap: Record<string, string> = {}
  if (colors !== null && typeof colors === 'object') {
    for (const [id, color] of Object.entries(colors as Record<string, unknown>)) {
      if (typeof id === 'string' && typeof color === 'string') colorMap[id] = color
    }
  }
  return { pinned: ids, colors: colorMap }
}

/** getSnapshot() may return {mode,status,value} or the doc itself. */
export function unwrapScopeValue(snap: unknown): unknown {
  if (snap === null || typeof snap !== 'object') return snap
  const rec = snap as { value?: unknown }
  return 'value' in rec ? rec.value : snap
}

/** Session-pin's browser-local copy, or null when there is none. */
export function readLocalPins(storage: StorageLike | undefined): ImportedPins | null {
  try {
    const raw = storage !== undefined ? storage.getItem(SESSION_PIN_LOCAL_KEY) : null
    if (raw !== null) {
      const parsed = JSON.parse(raw) as { pinned?: unknown; colors?: unknown }
      return normalizePins(parsed.pinned, parsed.colors)
    }
  } catch { /* no local state */ }
  return null
}

/**
 * DSH 0.1.5 path (the original reader): host settings namespace first, local
 * fallback second.
 */
export function readPinsFromScope(settingsScope: SettingsScopeLike | undefined, storage: StorageLike | undefined): ImportedPins {
  try {
    const bound = settingsScope?.bind?.<BoundScopeLike>({ namespace: SESSION_PIN_NS })
    const snap = bound?.getSnapshot?.()
    const value = unwrapScopeValue(snap)
    if (value !== null && value !== undefined) return normalizePins((value as { pinned?: unknown }).pinned, (value as { colors?: unknown }).colors)
  } catch { /* namespace not exposed on this baseline */ }
  return readLocalPins(storage) ?? { pinned: [], colors: {} }
}

/** The `session-pin` value out of a describe() answer, or undefined when absent. */
export function pinsFromDescribe(value: { namespaces?: unknown } | undefined): ImportedPins | undefined {
  const list = Array.isArray(value?.namespaces) ? value!.namespaces as unknown[] : []
  const row = list.find((n): n is { ns: string; value?: unknown } => n !== null && typeof n === 'object' && (n as { ns?: unknown }).ns === SESSION_PIN_NS)
  if (row === undefined || row.value === null || typeof row.value !== 'object') return undefined
  const v = row.value as { pinned?: unknown; colors?: unknown }
  return normalizePins(v.pinned, v.colors)
}

/** The slice of the client `workspaces` list face the native pin read needs. */
export interface WorkspacesListLike {
  getSnapshot(): { phase?: string; pinnedSessionIds?: readonly unknown[] }
  subscribe(listener: () => void): () => void
}

/**
 * The host's native pin set (DSH 0.2.x), once the workspaces list is ready.
 * @returns the pinned session ids, or null when this host has no native pin
 *   set (DSH 0.1.5) or the list did not become ready within `timeoutMs`.
 */
export function readNativePins(list: WorkspacesListLike | undefined, timeoutMs = 5000): Promise<string[] | null> {
  const read = (): string[] | null | undefined => {
    try {
      const snap = list?.getSnapshot()
      if (snap === undefined || !Array.isArray(snap.pinnedSessionIds)) return null
      if (snap.phase !== undefined && snap.phase !== 'ready') return undefined
      return snap.pinnedSessionIds.filter((x): x is string => typeof x === 'string')
    } catch { return null }
  }
  const now = read()
  if (now !== undefined || list === undefined) return Promise.resolve(now ?? null)
  return new Promise(resolve => {
    let done = false
    let unsubscribe: (() => void) | undefined
    const finish = (value: string[] | null): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      try { unsubscribe?.() } catch { /* already gone */ }
      resolve(value)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    try {
      unsubscribe = list.subscribe(() => { const v = read(); if (v !== undefined) finish(v) })
    } catch { finish(null) }
  })
}

export interface RemotePinOptions {
  /** Attempts for a failing describe (it can queue behind streaming traffic). */
  tries?: number
  /** Delay between attempts in ms. */
  retryMs?: number
  sleep?: (ms: number) => Promise<void>
  warn?: (message: string) => void
}

/**
 * DSH 0.2.x path: `remote.settings.describe()` for entry `session-pin`, then
 * the local fallback. A host without session-pin answers without that entry,
 * which is the graceful "nothing to import" case.
 */
export async function readPinsFromRemote(remote: RemoteSettingsLike | undefined, storage: StorageLike | undefined, opts: RemotePinOptions = {}): Promise<ImportedPins> {
  const tries = Math.max(1, opts.tries ?? 3)
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))
  if (remote !== undefined && typeof remote.describe === 'function') {
    for (let attempt = 1; attempt <= tries; attempt++) {
      try {
        const response = await remote.describe()
        if (response?.ok === true) {
          const pins = pinsFromDescribe(response.value)
          if (pins !== undefined) return pins
          break
        }
        if (attempt === tries) opts.warn?.('workspace-rail: session-pin describe failed: ' + String(response?.error?.code ?? response?.error?.message ?? 'not ok'))
      } catch (error) {
        if (attempt === tries) opts.warn?.('workspace-rail: session-pin describe failed: ' + String(error))
      }
      if (attempt < tries) await sleep(opts.retryMs ?? 1200)
    }
  }
  return readLocalPins(storage) ?? { pinned: [], colors: {} }
}

/**
 * DSH 0.2.x reader: the native pin set first, then a still-installed
 * dsh-session-pin entry, then the local copy.
 */
export async function readPinsWithoutScope(
  workspaces: WorkspacesListLike | undefined,
  remote: RemoteSettingsLike | undefined,
  storage: StorageLike | undefined,
  opts: RemotePinOptions & { nativeTimeoutMs?: number } = {},
): Promise<ImportedPins> {
  const native = await readNativePins(workspaces, opts.nativeTimeoutMs)
  if (native !== null && native.length > 0) return { pinned: native, colors: {} }
  return readPinsFromRemote(remote, storage, opts)
}
