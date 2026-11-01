// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { zstdCompressSync } from 'node:zlib'
import { SessionStore } from '../src/host/session-store.ts'

function memFs(files: Record<string, Buffer>) {
  return {
    readdir(path: string): string[] {
      const prefix = path.replace(/\/+$/, '') + '/'
      const direct = new Set<string>()
      for (const f of Object.keys(files)) {
        if (!f.startsWith(prefix)) continue
        const rest = f.slice(prefix.length)
        direct.add(rest.split('/')[0])
      }
      return [...direct]
    },
    readFile(path: string): Buffer {
      const f = files[path]
      if (f === undefined) throw new Error('ENOENT')
      return f
    },
  }
}

const jsonl = [
  JSON.stringify({ type: 'session', version: 0, id: 'sid', createdAt: 1 }),
  JSON.stringify({ type: 'user/message', seq: 1, data: { content: [{ type: 'text', text: 'research the grant balance' }] } }),
  JSON.stringify({ type: 'assistant/message', seq: 2, data: { message: { role: 'assistant', content: [{ type: 'text', text: 'reading the guide' }] } } }),
  JSON.stringify({ type: 'user/message', seq: 3, data: { content: [{ type: 'text', text: 'now check the queue' }] } }),
  JSON.stringify({ type: 'assistant/message', seq: 4, data: { message: { role: 'assistant', content: [{ type: 'text', text: 'queue reviewed, all clear' }] } } }),
].join('\n')

const blob = Buffer.concat(jsonl.split('\n').map(l => zstdCompressSync(Buffer.from(l))))

describe('SessionStore', () => {
  it('lists ids across cwd buckets', () => {
    const fs = memFs({ '/s/bucketA/sid1/x': Buffer.alloc(0), '/s/bucketB/sid2/x': Buffer.alloc(0) })
    const store = new SessionStore({ root: '/s', fs })
    expect(store.listIds().sort()).toEqual(['sid1', 'sid2'])
  })

  it('resolves a session by id and reads search windows', () => {
    const fs = memFs({ '/s/bucketA/sid/session.jsonl.zstd': blob })
    const store = new SessionStore({ root: '/s', fs })
    expect(store.pathFor('sid')).toBe('/s/bucketA/sid/session.jsonl.zstd')
    const win = store.readWindows('sid')
    expect(win?.first).toEqual(['research the grant balance', 'reading the guide', 'now check the queue'])
    expect(win?.last).toEqual(['reading the guide', 'now check the queue', 'queue reviewed, all clear'])
  })

  it('returns null for unknown ids', () => {
    const fs = memFs({})
    const store = new SessionStore({ root: '/s', fs })
    expect(store.pathFor('ghost')).toBeNull()
    expect(store.readWindows('ghost')).toBeNull()
  })

  it('handles truncated boundary frames on tail reads without failing', () => {
    // Cut the blob mid-way: the tail slice starts inside a frame.
    const fs = memFs({ '/s/b/sid/session.jsonl.zstd': blob })
    const store = new SessionStore({ root: '/s', fs, tailBytes: Math.max(1, Math.floor(blob.length / 2)) })
    const win = store.readWindows('sid')
    expect(win).not.toBeNull()
  })
})