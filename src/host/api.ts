// SPDX-License-Identifier: Apache-2.0
/**
 * The rail's own HTTP API (host side), mounted at /workspace-rail/api.
 *
 * Why it exists: dsh gives every NON-loopback browser (anyone reaching the GUI
 * through a public host name) a memory-mode settings scope - writes never reach the
 * host. Rail state kept in settings therefore lived only in that browser tab
 * and vanished on the next load. State, uploads and file checks go through
 * this API instead, backed by plain files.
 *
 * Routes:
 *   GET  /state                       -> { rev, state }
 *   PUT  /state   { baseRev, state }  -> { rev } | 409 { rev, state }
 *   POST /upload?project=ID&name=N    raw body -> { path, name, bytes }
 *   POST /project { id, name, instructions? } -> { dir }   (ensure folder, write AGENTS.md)
 *   GET  /health?project=ID           -> { [docId]: { status } }
 *   POST /project/delete { id }       -> { deleted }   (folder inside the projects root only)
 *
 * dsh does NOT authenticate plugin routes (verified 2026-09-27: dsh-mail's
 * /api/state answers 200 with no cookie while /api/chats is 401), so every
 * request is checked here: loopback peer + trusted Host; mutations also need
 * same-origin, a matching Origin, the X-Requested-With marker (forces a CORS
 * preflight cross-site) and the harness browser-session cookie. Pattern from
 * dsh-mail/lib/security.js.
 * @module dsh-workspace-rail/host/api
 */
import { createHash } from 'node:crypto'
import { createWriteStream, promises as fsp, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const API_PREFIX = '/workspace-rail/api'
export const MARKER = 'dsh-workspace-rail'
const MAX_STATE_BYTES = 4 * 1024 * 1024
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024

// ---- request gate ------------------------------------------------------------

const hdr = (req: IncomingMessage, name: string): string | undefined => {
  const v = req.headers[name]
  return typeof v === 'string' ? v : undefined
}
function isLoopbackHostname(h: string): boolean {
  if (h === 'localhost' || h === '[::1]') return true
  const p = h.split('.')
  return p.length === 4 && p[0] === '127' && p.every(x => /^\d{1,3}$/.test(x) && Number(x) <= 255)
}
function isLoopbackPeer(addr: string | undefined): boolean {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(String(addr ?? ''))
}
function hostOf(req: IncomingMessage): URL | undefined {
  try { return new URL('http://' + (hdr(req, 'host') ?? '')) } catch { return undefined }
}
export function harnessCookieName(host: string): string {
  const d = createHash('sha256').update(host).digest('base64')
  return 'dsh-auth-' + d.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}
function hasCookie(cookie: string | undefined, name: string): boolean {
  if (cookie === undefined) return false
  return cookie.split(';').some(seg => {
    const at = seg.indexOf('=')
    return at !== -1 && seg.slice(0, at).trim() === name && seg.slice(at + 1).trim().length > 0
  })
}

/**
 * Default trusted authorities: the ones DSH itself trusts. `dsh web` takes
 * `--trusted-host <authority...>` (repeatable, variadic, or `--trusted-host=x`)
 * and its own /api fence accepts exactly those, so a deployment reachable
 * under a public host already names it there. The comma-separated
 * `DSH_WORKSPACE_RAIL_TRUSTED_HOSTS` variable adds more. Loopback is always
 * accepted by the gate and needs no entry.
 */
export function harnessTrustedHosts(argv: readonly string[], env: Record<string, string | undefined>): string[] {
  const out: string[] = []
  const add = (v: string): void => {
    const s = v.trim()
    if (s !== '' && !out.includes(s)) out.push(s)
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? ''
    if (a.startsWith('--trusted-host=')) { add(a.slice('--trusted-host='.length)); continue }
    if (a !== '--trusted-host') continue
    while (i + 1 < argv.length && !(argv[i + 1] ?? '').startsWith('-')) add(argv[++i] ?? '')
  }
  for (const v of (env['DSH_WORKSPACE_RAIL_TRUSTED_HOSTS'] ?? '').split(',')) add(v)
  return out
}

export interface GateResult { ok: boolean; status: number; reason: string }

/** Read gate: loopback peer, trusted Host, not cross-site. */
export function checkRead(req: IncomingMessage, trustedHosts: readonly string[]): GateResult {
  if (!isLoopbackPeer(req.socket?.remoteAddress)) return { ok: false, status: 403, reason: 'non-loopback peer' }
  const host = hostOf(req)
  if (host === undefined) return { ok: false, status: 403, reason: 'bad Host' }
  if (!isLoopbackHostname(host.hostname) && !trustedHosts.includes(host.hostname) && !trustedHosts.includes(host.host)) {
    return { ok: false, status: 403, reason: 'untrusted Host' }
  }
  if (hdr(req, 'sec-fetch-site') === 'cross-site') return { ok: false, status: 403, reason: 'cross-site' }
  const origin = hdr(req, 'origin')
  if (origin !== undefined) {
    try { if (new URL(origin).host !== host.host) return { ok: false, status: 403, reason: 'Origin mismatch' } } catch { return { ok: false, status: 403, reason: 'bad Origin' } }
  }
  return { ok: true, status: 200, reason: '' }
}

/** Mutation gate: read gate + same-origin + Origin + marker header + harness cookie. */
export function checkMutate(req: IncomingMessage, trustedHosts: readonly string[]): GateResult {
  const read = checkRead(req, trustedHosts)
  if (!read.ok) return read
  // Browsers send Sec-Fetch-Site only to secure origins; when present it must
  // be same-origin. The Origin match (checkRead) + marker header cover both.
  const site = hdr(req, 'sec-fetch-site')
  if (site !== undefined && site !== 'same-origin') return { ok: false, status: 403, reason: 'sec-fetch-site must be same-origin' }
  if (hdr(req, 'origin') === undefined) return { ok: false, status: 403, reason: 'Origin required' }
  if (hdr(req, 'x-requested-with') !== MARKER) return { ok: false, status: 403, reason: 'marker header required' }
  const host = hostOf(req)!
  if (!hasCookie(hdr(req, 'cookie'), harnessCookieName(host.host))) return { ok: false, status: 403, reason: 'no harness session cookie' }
  return read
}

// ---- helpers -----------------------------------------------------------------

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}
function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((ok, fail) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) { fail(new Error('body too large')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => ok(Buffer.concat(chunks)))
    req.on('error', fail)
  })
}
async function writeAtomic(path: string, data: string | Buffer): Promise<void> {
  await fsp.mkdir(dirname(path), { recursive: true })
  const tmp = path + '.tmp-' + process.pid + '-' + Date.now()
  await fsp.writeFile(tmp, data, { mode: 0o600 })
  await fsp.rename(tmp, path)
}
export function expandHome(p: string): string {
  return p === '~' || p.startsWith('~/') ? homedir() + p.slice(1) : p
}

/** Folder-safe project slug: lowercase words + the id tail, so renames never collide. */
export function projectSlug(name: string, id: string): string {
  const base = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  const tail = id.replace(/[^a-z0-9]/gi, '').slice(-5).toLowerCase()
  return (base.length > 0 ? base : 'project') + '-' + tail
}

/** A file name safe to create inside a project folder (no separators, no dotfiles). */
export function safeFileName(name: string): string {
  const n = basename(name.replace(/\\/g, '/')).replace(/[\u0000-\u001f]/g, '').trim().replace(/^\.+/, '')
  return n.length > 0 ? n.slice(0, 180) : 'upload'
}

/** First free "name", "name (2).ext", "name (3).ext" … in `dir`. */
export async function freePath(dir: string, name: string): Promise<string> {
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let i = 1; i < 1000; i++) {
    const candidate = join(dir, i === 1 ? name : `${stem} (${i})${ext}`)
    try { await fsp.access(candidate) } catch { return candidate }
  }
  throw new Error('too many files named ' + name)
}

// ---- the API -------------------------------------------------------------------

export interface ApiOptions {
  /** ~/.dsh/workspace-rail */
  dataDir: string
  /** Root for per-project folders, e.g. ~/dsh-projects */
  projectsRoot: string
  trustedHosts: readonly string[]
  /** First-run seed (the old settings-namespace copy), or null. */
  seed: () => unknown
  log?: (m: string) => void
}

interface StateFile { rev: number; state: unknown }

export function createApi(opts: ApiOptions) {
  const statePath = join(opts.dataDir, 'state.json')
  let cache: StateFile | null = null
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(fn: () => Promise<T>): Promise<T> => { const p = queue.then(fn, fn); queue = p.catch(() => undefined); return p }

  async function load(): Promise<StateFile> {
    if (cache !== null) return cache
    try {
      cache = JSON.parse(await fsp.readFile(statePath, 'utf8')) as StateFile
    } catch {
      const seeded = opts.seed()
      cache = { rev: 1, state: seeded ?? null }
      if (seeded !== null && seeded !== undefined) {
        await writeAtomic(statePath, JSON.stringify(cache))
        opts.log?.('workspace-rail: state.json seeded from the settings namespace')
      }
    }
    return cache
  }

  const projectDir = (id: string, name: string): string => join(expandHome(opts.projectsRoot), projectSlug(name, id))

  async function projectFromState(pid: string): Promise<{ id: string; name: string; dir?: string } | null> {
    const s = (await load()).state as { projects?: Record<string, { id: string; name: string; dir?: string }> } | null
    return s?.projects?.[pid] ?? null
  }

  async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? '/', 'http://rail.local')
      const sub = (url.pathname.startsWith(API_PREFIX) ? url.pathname.slice(API_PREFIX.length) : url.pathname).replace(/\/+$/, '') || '/'
      const isRead = req.method === 'GET' || req.method === 'HEAD'
      const gate = isRead ? checkRead(req, opts.trustedHosts) : checkMutate(req, opts.trustedHosts)
      if (!gate.ok) { sendJson(res, gate.status, { error: gate.reason }); return }

      if (req.method === 'GET' && sub === '/state') {
        const f = await load()
        sendJson(res, 200, { rev: f.rev, state: f.state })
        return
      }
      if (req.method === 'PUT' && sub === '/state') {
        const body = JSON.parse((await readBody(req, MAX_STATE_BYTES)).toString('utf8')) as { baseRev?: number; state?: unknown }
        const out = await serial(async () => {
          const f = await load()
          if (typeof body.baseRev === 'number' && body.baseRev !== f.rev) return { status: 409, body: { rev: f.rev, state: f.state } }
          if (body.state === null || typeof body.state !== 'object') return { status: 400, body: { error: 'state must be an object' } }
          const next = { rev: f.rev + 1, state: body.state }
          await writeAtomic(statePath, JSON.stringify(next))
          cache = next
          return { status: 200, body: { rev: next.rev } }
        })
        sendJson(res, out.status, out.body)
        return
      }
      if (req.method === 'POST' && sub === '/project') {
        const body = JSON.parse((await readBody(req, 256 * 1024)).toString('utf8')) as { id?: string; name?: string; instructions?: string; dir?: string }
        if (typeof body.id !== 'string' || typeof body.name !== 'string') { sendJson(res, 400, { error: 'id and name required' }); return }
        const dir = typeof body.dir === 'string' && body.dir.length > 0 ? resolve(expandHome(body.dir)) : projectDir(body.id, body.name)
        await fsp.mkdir(dir, { recursive: true })
        if (typeof body.instructions === 'string') {
          const agents = join(dir, 'AGENTS.md')
          const text = body.instructions.trim()
          if (text.length > 0) await writeAtomic(agents, text + '\n')
          else await fsp.rm(agents, { force: true })
          try { await fsp.chmod(agents, 0o644) } catch { /* removed */ }
        }
        sendJson(res, 200, { dir })
        return
      }
      if (req.method === 'POST' && sub === '/project/delete') {
        // Only ever the folder the saved state records for this project, and
        // only if it lies inside the projects root - never a client-sent path.
        const body = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8')) as { id?: string }
        const project = typeof body.id === 'string' ? await projectFromState(body.id) : null
        if (project === null) { sendJson(res, 404, { error: 'unknown project' }); return }
        const dir = resolve(project.dir !== undefined && project.dir.length > 0 ? expandHome(project.dir) : projectDir(project.id, project.name))
        const root = resolve(expandHome(opts.projectsRoot))
        if (!dir.startsWith(root + '/') || dir === root) { sendJson(res, 400, { error: 'project folder is outside the projects root; not deleting' }); return }
        await fsp.rm(dir, { recursive: true, force: true })
        sendJson(res, 200, { deleted: dir })
        return
      }
      if (req.method === 'POST' && sub === '/upload') {
        const pid = url.searchParams.get('project') ?? ''
        const project = await projectFromState(pid)
        if (project === null) { sendJson(res, 404, { error: 'unknown project' }); return }
        const dir = project.dir !== undefined && project.dir.length > 0 ? expandHome(project.dir) : projectDir(project.id, project.name)
        await fsp.mkdir(dir, { recursive: true })
        const target = await freePath(dir, safeFileName(url.searchParams.get('name') ?? 'upload'))
        if (resolve(dirname(target)) !== resolve(dir)) { sendJson(res, 400, { error: 'bad name' }); return }
        const bytes = await new Promise<number>((ok, fail) => {
          let size = 0
          const out = createWriteStream(target, { flags: 'wx', mode: 0o644 })
          req.on('data', (c: Buffer) => {
            size += c.length
            if (size > MAX_UPLOAD_BYTES) { req.destroy(); out.destroy(); fsp.rm(target, { force: true }).finally(() => fail(new Error('file larger than 200 MB'))) }
          })
          req.pipe(out)
          out.on('finish', () => ok(size))
          out.on('error', fail)
          req.on('error', fail)
        })
        sendJson(res, 200, { path: target, name: basename(target), bytes, dir })
        return
      }
      if (req.method === 'GET' && sub === '/health') {
        const pid = url.searchParams.get('project') ?? ''
        const s = (await load()).state as { docs?: Record<string, { projectId: string; pointer: string }> } | null
        const out: Record<string, { status: 'ok' | 'missing' }> = {}
        for (const [id, d] of Object.entries(s?.docs ?? {})) {
          if (d.projectId !== pid) continue
          if (/^https?:\/\//i.test(d.pointer) || d.pointer.length === 0) { out[id] = { status: 'ok' }; continue }
          try { statSync(expandHome(d.pointer)); out[id] = { status: 'ok' } } catch { out[id] = { status: 'missing' } }
        }
        sendJson(res, 200, out)
        return
      }
      sendJson(res, 404, { error: 'not found' })
    } catch (error) {
      opts.log?.('workspace-rail: api error: ' + String((error as Error)?.message ?? error))
      try { if (!res.headersSent) sendJson(res, 500, { error: String((error as Error)?.message ?? error) }); else res.end() } catch { /* socket gone */ }
    }
  }

  return { handler, load, statePath }
}
