// SPDX-License-Identifier: Apache-2.0
/**
 * Host half of the dual-face workspace-rail plugin. The durable state
 * (folders, projects, memberships, stripes, docs) lives in the rail's own file
 * `~/.dsh/workspace-rail/state.json` behind its own HTTP API (host/api.ts).
 *
 * The plugin runs on two DSH lines with the same build; the mode is chosen by
 * capability, never by a version string (see {@link settingsMode}):
 *
 * - DSH 0.1.5 ('register'): `ctx.settings.register` exists. The plugin
 *   registers the `workspace-rail` namespace exactly as before: it seeds
 *   state.json on a first boot and carries the transcript-window bridge (the
 *   browser half posts batched session ids into `indexRequests`, a settings
 *   field, the sanctioned dual-face channel dsh-session-pin also uses; the
 *   host decompresses head/tail frames of each transcript and mirrors compact
 *   search windows back into `windows`).
 * - DSH 0.2.x ('forms'): settings are forms over each entry's exported
 *   `Config`, stored in the profile row. There is no namespace to register and
 *   nothing to seed from, so the host serves state.json only and the settings
 *   bridge is not mounted. Pointer health is the API's own `GET /health` on
 *   both lines. `Config` deliberately has no volatile field: the core's
 *   one-time settings.yaml import then refuses the stale `workspace-rail:`
 *   section instead of copying it into the profile row.
 * @module dsh-workspace-rail
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { SettingsNamespace, SettingsRegisterOptions, SettingsScope } from '@deepseek-ai/dsh-settings'
import { EMPTY_RAIL_STATE, RAIL_SCHEMA_VERSION } from './store.ts'
import { SessionStore } from './host/session-store.ts'
import { checkPointers } from './host/pointer-health.ts'
import { API_PREFIX, createApi, expandHome, harnessTrustedHosts } from './host/api.ts'
import { searchProject } from './host/search.ts'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'workspace-rail'

export const inject = ['settings', 'webServer']

export type Config = {
  /** Mount the rail panel in the web GUI. */
  enableRail: boolean
  /** Color-coded stripe edge on chat/folder/project rows. */
  stripeEdge: 'right' | 'left'
  /** Hard cap on catalog rows kept in the Recents feed. */
  recentsMaxRows: number
  /** Bridge transcript search windows over the settings namespace. */
  enableWindowsIndex: boolean
  /** Max sessions kept in the mirrored windows map (oldest pruned). */
  windowsMaxSessions: number
  /** Verify project doc pointers on disk (repairRequests bridge). */
  enablePointerHealth: boolean
  /** Where per-project folders (uploads + AGENTS.md instructions) are created. */
  projectsRoot: string
  /**
   * Host names (besides loopback) the rail API accepts, e.g. the public GUI host.
   * Empty (the default): the authorities DSH itself trusts, that is every
   * `--trusted-host` value of the `dsh web` command line, plus the
   * comma-separated `DSH_WORKSPACE_RAIL_TRUSTED_HOSTS` environment variable.
   */
  trustedHosts: string[]
}

export const Config: z<Config> = z.object({
  enableRail: z.boolean().default(true),
  stripeEdge: z.union(['right', 'left'] as const).default('right'),
  recentsMaxRows: z.number().step(1).min(100).max(50_000).default(5000),
  // OFF by default (2026-09-27): the index mirrors chat message text into the
  // shared settings.yaml; one message serialized as invalid YAML there and
  // dsh-web could not boot. Re-enable only once windows live in their own file.
  enableWindowsIndex: z.boolean().default(false),
  windowsMaxSessions: z.number().step(1).min(100).max(10_000).default(2000),
  enablePointerHealth: z.boolean().default(true),
  projectsRoot: z.string().default('~/dsh-projects'),
  trustedHosts: z.array(z.string()).default([]),
})

/** User-layer rail document shape mirrored by the browser half. */
export interface RailUserLayer {
  schemaVersion: number
  folders: Record<string, unknown>
  folderOrder: string[]
  projects: Record<string, unknown>
  projectOrder: string[]
  memberships: Record<string, string>
  stripes: Record<string, string>
  stripeEdge: 'right' | 'left'
}

const RailSchema = z.object({
  schemaVersion: z.number().default(RAIL_SCHEMA_VERSION),
  folders: z.any().default({}),
  folderOrder: z.array(z.string()).default([]),
  projects: z.any().default({}),
  projectOrder: z.array(z.string()).default([]),
  pinned: z.array(z.string()).default([]),
  sessionFolders: z.dict(z.string()).default({}),
  memberships: z.dict(z.string()).default({}),
  stripes: z.dict(z.string()).default({}),
  docs: z.any().default({}),
  importedSessionPinAt: z.any().default(null),
  stripeEdge: z.union(['right', 'left'] as const).default('right'),
  enableRail: z.boolean().default(true),
  recentsMaxRows: z.number().default(5000),
  journal: z.array(z.any()).default([]),
  indexRequests: z.array(z.string()).default([]),
  windows: z.any().default({}),
  docHealth: z.any().default({}),
  repairRequests: z.array(z.string()).default([]),
})

/** Window entry: capped text previews per session. */
export interface WindowEntry { f: string[]; l: string[] }

/** Poll cadence for the window bridge (host side). */
const BRIDGE_POLL_MS = 5000
/** Per-tick processing budget (idle indexing, never a burst). */
const BRIDGE_BUDGET_MS = 2000

/** Which settings face the host offers (capability, not version). */
export type SettingsMode = 'register' | 'forms' | 'none'

/**
 * Detect the settings face of the running host.
 * @param ctx - harness context (must `inject` 'settings').
 * @returns 'register' on DSH 0.1.5, 'forms' on DSH 0.2.x, 'none' otherwise.
 */
export function settingsMode(ctx: Context): SettingsMode {
  let settings: { register?: unknown; update?: unknown; describe?: unknown } | undefined
  try { settings = (ctx as unknown as { settings?: typeof settings }).settings } catch { return 'none' }
  if (settings === undefined || settings === null) return 'none'
  if (typeof settings.register === 'function') return 'register'
  if (typeof settings.update === 'function' && typeof settings.describe === 'function') return 'forms'
  return 'none'
}

/**
 * Register the namespace (DSH 0.1.5), mount the API and start the window bridge.
 * @param ctx - harness context exposing the settings service.
 * @param config - rail policy from the cordis.yml row.
 */
export function apply(ctx: Context, config: Config): void {
  const mode = settingsMode(ctx)
  let scope: SettingsScope<Record<string, unknown>> | null = null
  if (mode === 'register') {
    const options = {
      base: {
        ...EMPTY_RAIL_STATE,
        enableRail: config.enableRail,
        stripeEdge: config.stripeEdge,
        recentsMaxRows: config.recentsMaxRows,
        indexRequests: [],
        windows: {},
        journal: [],
        docHealth: {},
        repairRequests: [],
      },
      applies: 'live' as const,
    } as unknown as SettingsRegisterOptions<Record<string, unknown>>
    // Service Provider - register the namespace (the plugin's durable surface on 0.1.5).
    scope = ctx.settings.register(
      'workspace-rail' as SettingsNamespace,
      RailSchema,
      options,
    ) as unknown as SettingsScope<Record<string, unknown>>
  }
  const legacyScope = scope

  // The rail's own API + file store (settings are memory-only for remote browsers).
  const PERSISTED = ['schemaVersion', 'folders', 'folderOrder', 'projects', 'projectOrder', 'pinned', 'sessionFolders', 'memberships', 'stripes', 'docs', 'journal', 'importedSessionPinAt', 'stripeEdge']
  const api = createApi({
    dataDir: join(homedir(), '.dsh', 'workspace-rail'),
    projectsRoot: config.projectsRoot ?? '~/dsh-projects',
    trustedHosts: config.trustedHosts?.length ? config.trustedHosts : harnessTrustedHosts(process.argv, process.env),
    seed: () => {
      // Only the 0.1.5 namespace can seed; on 0.2.x state.json is the only store.
      if (legacyScope === null) return null
      try {
        const v = legacyScope.get() as Record<string, unknown> | undefined
        if (v === undefined || v === null) return null
        const out: Record<string, unknown> = {}
        for (const k of PERSISTED) if (k in v) out[k] = v[k]
        return out
      } catch { return null }
    },
    log: m => console.log(m),
  })
  const web = (ctx as unknown as { webServer?: { register(r: { kind: 'prefix'; path: string; handler: (req: never, res: never) => unknown }): () => void } }).webServer
  const effect = (ctx as unknown as { effect?(fn: () => () => void, label?: string): unknown }).effect
  if (web !== undefined && effect !== undefined) {
    effect.call(ctx, () => web.register({ kind: 'prefix', path: API_PREFIX, handler: api.handler as never }), 'workspace-rail: api route')
  }

  // project_search: an agent tool scoped to the calling chat's project.
  registerProjectSearch(ctx, api.load)

  if (legacyScope !== null) {
    ctx.logger?.info?.('workspace-rail: armed - settings namespace registered' + (config.enableWindowsIndex || config.enablePointerHealth ? ', window/pointer bridge on' : ''))
    if (config.enableWindowsIndex || config.enablePointerHealth) mountWindowBridge(ctx, legacyScope, config)
    return
  }
  // DSH 0.2.x: no settings namespace, so no settings bridge. console, not
  // ctx.logger, so the line reaches the journal (see registerProjectSearch).
  console.log('workspace-rail: armed - state.json store, no settings namespace on this host (settings mode: ' + mode + ')'
    + (config.enableWindowsIndex ? '; enableWindowsIndex needs the DSH 0.1.5 settings namespace and stays off' : ''))
}

/**
 * Window bridge: poll `indexRequests`, decompress head/tail frames per id,
 * merge capped windows into `windows`, echo the remaining queue back.
 * @param ctx - harness context (logger + fiber-bound timers).
 * @param scope - the registered settings scope.
 * @param config - rail policy.
 */
function mountWindowBridge(ctx: Context, scope: SettingsScope<Record<string, unknown>>, config: Config): void {
  const store = new SessionStore()
  const tick = (): void => {
    // Pointer health is independent of the window index: run it first, and
    // never index windows unless the policy says so (the old loop checked
    // neither, so turning the index off did not stop it).
    if (config.enablePointerHealth) processRepairs(scope)
    if (!config.enableWindowsIndex) return
    let requests: string[] = []
    try {
      const doc = scope.get() as { indexRequests?: unknown; windows?: Record<string, WindowEntry> }
      if (!Array.isArray(doc?.indexRequests) || doc.indexRequests.length === 0) return
      requests = doc.indexRequests.filter((x): x is string => typeof x === 'string')
    } catch (error) {
      ctx.logger?.warn?.('workspace-rail: bridge read failed: ' + String(error))
      return
    }
    // Time budget, not a fixed batch: frames are ~4ms each, so sessions vary
    // from ~10ms to ~2s. Whatever does not fit stays queued and the next tick
    // resumes - deep indexing is an idle job, not a burst.
    const started = Date.now()
    const windows: Record<string, WindowEntry> = { ...(scope.get() as { windows?: Record<string, WindowEntry> }).windows }
    let processed = 0
    let idx2 = 0
    while (idx2 < requests.length && Date.now() - started < BRIDGE_BUDGET_MS) {
      const id = requests[idx2]!
      idx2++
      processed++
      try {
        const win = store.readWindows(id)
        if (win !== null) windows[id] = { f: win.first, l: win.last }
      } catch { /* unreadable transcript: skipped, not fatal */ }
    }
    void processed
    // Prune oldest-inserted beyond the cap.
    const keys = Object.keys(windows)
    if (keys.length > config.windowsMaxSessions) {
      for (const k of keys.slice(0, keys.length - config.windowsMaxSessions)) delete windows[k]
    }
    const remaining = requests.slice(idx2)
    void scope.update({ windows, indexRequests: remaining }).catch((error: unknown) => {
      ctx.logger?.warn?.('workspace-rail: bridge write failed: ' + String(error))
    })
  }
  /** Check project doc pointers on disk and mirror docHealth back. */
  const processRepairs = (scope2: SettingsScope<Record<string, unknown>>): void => {
    try {
      const doc = scope2.get() as { repairRequests?: unknown; docs?: Record<string, { projectId?: string; pointer?: string }>; docHealth?: Record<string, { status: string; repaired?: string }> }
      const requested = Array.isArray(doc?.repairRequests) ? (doc.repairRequests as string[]) : []
      if (requested.length === 0) return
      const allDocs = doc?.docs ?? {}
      const health: Record<string, { status: string; repaired?: string }> = { ...(doc?.docHealth ?? {}) }
      for (const pid of requested) {
        const projectDocs = Object.values(allDocs).filter(d => d.projectId === pid && typeof d.pointer === 'string')
        Object.assign(health, checkPointers(projectDocs.map(d => ({ id: (d as unknown as { id: string }).id, pointer: d.pointer ?? '' }))))
      }
      void scope2.update({ docHealth: health, repairRequests: [] }).catch((error: unknown) => {
        ctx.logger?.warn?.('workspace-rail: pointer health write failed: ' + String(error))
      })
    } catch (error) {
      ctx.logger?.warn?.('workspace-rail: pointer health failed: ' + String(error))
    }
  }

  // Fiber-bound timer where cordis provides one; plain interval otherwise.
  const ctxAny = ctx as unknown as { setInterval?(fn: () => void, ms: number): unknown }
  // Merely READING ctx.setInterval throws "cannot get property timer without
  // inject" when 'timer' is not in `inject`, which crash-looped dsh-web on
  // 2026-09-27; probe it inside try and fall back to a plain interval.
  let hasCtxInterval = false
  try {
    hasCtxInterval = typeof ctxAny.setInterval === 'function'
  } catch {}
  if (hasCtxInterval) ctxAny.setInterval!(tick, BRIDGE_POLL_MS)
  else {
    const timer = setInterval(tick, BRIDGE_POLL_MS)
    timer.unref?.()
  }
}
// ---- agent tool: project_search ------------------------------------------------

/** dsh's defineTool, resolved the way dsh-mail does (the harness's own copy). */
function resolveDefineTool(): ((def: unknown) => unknown) | null {
  const bases = [import.meta.url, join(homedir(), '.dsh', 'profiles', 'web', 'probe.js')]
  if (process.argv[1] !== undefined) bases.push(process.argv[1])
  for (const base of bases) {
    try {
      const mod = createRequire(base)('@deepseek-ai/dsh-tools') as { defineTool?: unknown; default?: { defineTool?: unknown } }
      const fn = mod.defineTool ?? mod.default?.defineTool
      if (typeof fn === 'function') return fn as (def: unknown) => unknown
    } catch { /* next base */ }
  }
  return null
}

interface RailProject { id: string; name: string; dir?: string }
interface RailDoc { projectId: string; pointer: string }
interface RailStateLike { projects?: Record<string, RailProject>; memberships?: Record<string, string>; docs?: Record<string, RailDoc> }

/** The project a chat belongs to: its folder is (inside) a project folder, or it was added to one. */
export function projectForChat(state: RailStateLike | null, cwd: string | undefined, sessionId: string | undefined): RailProject | null {
  const projects = Object.values(state?.projects ?? {})
  if (cwd !== undefined) {
    const c = cwd.replace(/\/+$/, '')
    const byDir = projects.find(p => p.dir !== undefined && (c === expandHome(p.dir).replace(/\/+$/, '') || c.startsWith(expandHome(p.dir).replace(/\/+$/, '') + '/')))
    if (byDir !== undefined) return byDir
  }
  const pid = sessionId !== undefined ? state?.memberships?.[sessionId] : undefined
  return pid !== undefined ? (state?.projects?.[pid] ?? null) : null
}

export function registerProjectSearch(ctx: Context, load: () => Promise<{ state: unknown }>): void {
  // console, not ctx.logger: the host logger is not wired to the journal, so
  // ctx.logger messages were invisible and a failed registration went unseen.
  const defineTool = resolveDefineTool()
  const inject = (ctx as unknown as { inject?(deps: string[], cb: (sub: Record<string, any>) => void): unknown }).inject
  if (defineTool === null || inject === undefined) { console.error('workspace-rail: project_search NOT registered: ' + (defineTool === null ? 'defineTool unresolved' : 'ctx.inject missing')); return }
  inject.call(ctx, ['tools'], sub => {
   try {
    const TEXT = (s: string) => [{ type: 'text', text: s }]
    sub.tools.register(defineTool({
      name: 'project_search',
      description: 'Search the files of the project this chat belongs to (its project folder, uploads and linked files: text, code, Markdown, CSV/JSON, PDF, Word). ' +
        'Returns the best-matching passages with file and line so you can cite them. Use it before answering questions about the project\'s documents, ' +
        'especially when there are more files than you can read. Only works in chats that belong to a project.',
      parameters: {
        query: { type: 'string', required: true, description: 'Words to look for (keywords work better than full questions).' },
        limit: { type: 'number', description: 'How many passages to return (default 8, max 30).' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            ok: { type: 'boolean', required: true },
            project: { type: 'string' },
            files: { type: 'number' },
            hits: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { file: { type: 'string' }, line: { type: 'number' }, score: { type: 'number' }, text: { type: 'string' } } } },
            unreadable: { type: 'array', items: { type: 'string' } },
            error: { type: 'string' },
          },
        },
        render: (_a: unknown, v: { ok: boolean; project?: string; files?: number; hits?: Array<{ file: string; line: number; text: string }>; error?: string }) => {
          if (!v.ok) return TEXT('project_search: ' + (v.error ?? 'failed'))
          if ((v.hits ?? []).length === 0) return TEXT(`No matches in "${v.project}" (${v.files} files searched).`)
          return TEXT(`${v.hits!.length} passages from "${v.project}" (${v.files} files):\n\n` + v.hits!.map(h => `--- ${h.file}:${h.line}\n${h.text}`).join('\n\n'))
        },
      },
      async execute(args: { query: string; limit?: number }, exec: { agent?: { session?: { header?: { id?: string; cwd?: string } } } }) {
        try {
          const header = exec?.agent?.session?.header
          const state = (await load()).state as RailStateLike | null
          const project = projectForChat(state, header?.cwd, header?.id)
          if (project === null) return { ok: false, error: 'this chat is not part of a project (start it with + New chat in a project, or add it to one)' }
          const dir = project.dir !== undefined ? expandHome(project.dir) : null
          const linked = Object.values(state?.docs ?? {})
            .filter(d => d.projectId === project.id && !/^https?:\/\//i.test(d.pointer))
            .map(d => expandHome(d.pointer))
            .filter(p => dir === null || !(p === dir || p.startsWith(dir + '/')))
          const res = await searchProject(dir, linked, String(args.query ?? ''), typeof args.limit === 'number' ? args.limit : 8)
          // DSH 0.2.1 rejects results that are not lossless JSON (an undefined project.name, for one): drop undefined keys.
          return JSON.parse(JSON.stringify({ ok: true, project: project.name ?? '', files: res.files, hits: res.hits.map(h => ({ ...h, text: h.text.slice(0, 1200) })), unreadable: res.unreadable })) as Record<string, unknown>
        } catch (error) {
          return { ok: false, error: String((error as Error)?.message ?? error) }
        }
      },
    }))
    console.log('workspace-rail: project_search tool registered')
   } catch (error) { console.error('workspace-rail: project_search registration failed: ' + String((error as Error)?.stack ?? error)) }
  })
}
