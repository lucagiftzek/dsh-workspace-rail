// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { checkPointers, expandPointer, type FsStatFace } from '../src/host/pointer-health.ts'

const fs: FsStatFace = {
  stat(path: string): { isFile(): boolean } {
    if (path === '/home/t/docs/a.md' || path === 'https://x') throw new Error('ENOENT')
    return { isFile: () => true }
  },
}

describe('expandPointer', () => {
  it('expands ~ and ~/prefix, leaves others alone', () => {
    expect(expandPointer('~')).toMatch(/\/[^/]+$/)
    expect(expandPointer('~/docs/a.md')).toMatch(/\/docs\/a\.md$/)
    expect(expandPointer('/abs/path')).toBe('/abs/path')
  })
})

describe('checkPointers', () => {
  it('ok for existing absolute paths, repaired for tilde-expansions', () => {
    const h = checkPointers([
      { id: 'a', pointer: '/exists/a.md' },
      { id: 'b', pointer: '~/docs/a.md' },
    ], fs)
    expect(h['a']).toEqual({ status: 'ok' })
    expect(h['b']?.status).toBe('ok')
    expect(h['b']?.repaired).toBeDefined()
  })

  it('missing for absent paths; urls and empty pointers are ok (non-fs)', () => {
    const h = checkPointers([
      { id: 'x', pointer: '/home/t/docs/a.md' },
      { id: 'y', pointer: 'https://example.com/f.md' },
      { id: 'z', pointer: '' },
    ], fs)
    expect(h['x']?.status).toBe('missing')
    expect(h['y']?.status).toBe('ok')
    expect(h['z']?.status).toBe('ok')
  })
})
