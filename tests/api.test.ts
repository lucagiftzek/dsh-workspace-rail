// SPDX-License-Identifier: Apache-2.0
// The rail's own host API, exercised over real HTTP on loopback.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApi, harnessCookieName, projectSlug, safeFileName } from '../src/host/api.ts'

let server: Server
let base = ''
let host = ''
const root = mkdtempSync(join(tmpdir(), 'rail-api-'))
const seed = { projects: { p1: { id: 'p1', name: 'Acme legal', hueKey: 'teal', workspaceId: null, autoCarryover: false } }, projectOrder: ['p1'], docs: {} }

beforeAll(async () => {
  const api = createApi({ dataDir: join(root, 'data'), projectsRoot: join(root, 'projects'), trustedHosts: ['app.example.com'], seed: () => seed })
  server = createServer((req, res) => { void api.handler(req, res) })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()))
  const port = (server.address() as { port: number }).port
  base = `http://127.0.0.1:${port}/workspace-rail/api`
  host = `127.0.0.1:${port}`
})
afterAll(() => { server.close(); rmSync(root, { recursive: true, force: true }) })

const mutHeaders = (extra: Record<string, string> = {}) => ({
  origin: `http://${host}`, 'sec-fetch-site': 'same-origin', 'x-requested-with': 'dsh-workspace-rail',
  cookie: `${harnessCookieName(host)}=abc`, 'content-type': 'application/json', ...extra,
})

describe('rail api', () => {
  it('serves the seeded state (migration from the settings copy)', async () => {
    const r = await fetch(base + '/state')
    const body = await r.json() as { rev: number; state: typeof seed }
    expect(r.status).toBe(200)
    expect(body.state.projects.p1.name).toBe('Acme legal')
  })

  it('refuses mutations without the harness cookie, marker, or from another site', async () => {
    const put = (h: Record<string, string>) => fetch(base + '/state', { method: 'PUT', headers: h, body: JSON.stringify({ state: {} }) })
    const good = mutHeaders()
    const { cookie: _c, ...noCookie } = good
    expect((await put(noCookie)).status).toBe(403)
    const { ['x-requested-with']: _m, ...noMarker } = good
    expect((await put(noMarker)).status).toBe(403)
    expect((await put({ ...good, 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await put({ ...good, origin: 'https://evil.example' })).status).toBe(403)
    const { origin: _o, ...noOrigin } = good
    expect((await put(noOrigin)).status).toBe(403)
    const { ['sec-fetch-site']: _sf, ...plainHttp } = good
    expect((await put({ ...plainHttp, 'content-type': 'application/json' })).status).not.toBe(403) // insecure origin: no Sec-Fetch-*
  })

  it('PUT with a stale revision gets 409 and the current copy', async () => {
    const cur = await (await fetch(base + '/state')).json() as { rev: number }
    const ok = await fetch(base + '/state', { method: 'PUT', headers: mutHeaders(), body: JSON.stringify({ baseRev: cur.rev, state: { ...seed, pinned: ['s1'] } }) })
    expect(ok.status).toBe(200)
    const stale = await fetch(base + '/state', { method: 'PUT', headers: mutHeaders(), body: JSON.stringify({ baseRev: cur.rev, state: seed }) })
    expect(stale.status).toBe(409)
    expect(((await stale.json()) as { state: { pinned: string[] } }).state.pinned).toEqual(['s1'])
  })

  it('upload writes into the project folder, never outside it, and never overwrites', async () => {
    const up = (name: string, text: string) => fetch(`${base}/upload?project=p1&name=${encodeURIComponent(name)}`, { method: 'POST', headers: mutHeaders({ 'content-type': 'application/octet-stream' }), body: text })
    const a = await (await up('../../etc/passwd', 'x')).json() as { path: string; dir: string }
    expect(a.path.startsWith(a.dir + '/')).toBe(true)
    expect(a.path.endsWith('/passwd')).toBe(true)
    const b = await (await up('notes.md', 'one')).json() as { path: string }
    const c = await (await up('notes.md', 'two')).json() as { path: string }
    expect(c.path.endsWith('notes (2).md')).toBe(true)
    expect(readFileSync(b.path, 'utf8')).toBe('one')
    expect((await up('x.txt', 'x').then(r => r.status))).toBe(200)
    expect((await fetch(`${base}/upload?project=nope&name=a`, { method: 'POST', headers: mutHeaders(), body: 'x' })).status).toBe(404)
  })

  it('POST /project creates the folder and writes (or clears) AGENTS.md', async () => {
    const r = await fetch(base + '/project', { method: 'POST', headers: mutHeaders(), body: JSON.stringify({ id: 'p1', name: 'Acme legal', instructions: '# Project\nBe brief.' }) })
    const { dir } = await r.json() as { dir: string }
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toContain('Be brief.')
    await fetch(base + '/project', { method: 'POST', headers: mutHeaders(), body: JSON.stringify({ id: 'p1', name: 'Acme legal', instructions: '' }) })
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(false)
  })

  it('names are folder- and file-safe', () => {
    expect(projectSlug('Ériou n / Legal!!', 'p_abc12345')).toBe('eriou-n-legal-12345')
    expect(safeFileName('../..\\secret/.env')).toBe('env')
    expect(safeFileName('')).toBe('upload')
  })

  it('project delete removes only the recorded folder, inside the projects root', async () => {
    const r = await fetch(base + '/project', { method: 'POST', headers: mutHeaders(), body: JSON.stringify({ id: 'p1', name: 'Acme legal' }) })
    const { dir } = await r.json() as { dir: string }
    expect(existsSync(dir)).toBe(true)
    const del = await fetch(base + '/project/delete', { method: 'POST', headers: mutHeaders(), body: JSON.stringify({ id: 'p1', dir: '/etc' }) })
    expect(del.status).toBe(200)
    expect(existsSync(dir)).toBe(false)
    expect(existsSync('/etc')).toBe(true)
    expect((await fetch(base + '/project/delete', { method: 'POST', headers: mutHeaders(), body: JSON.stringify({ id: 'nope' }) })).status).toBe(404)
  })
})
