// SPDX-License-Identifier: Apache-2.0
// DSH 0.2.1 rejects a tool result that is not lossless JSON ("value is not lossless JSON").
// Run every project_search path (hit, no hit, no project, unreadable file, bad input, load failure) through
// the core's own rule.
import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerProjectSearch } from '../src/index.ts'
// @ts-expect-error plain ESM helper without types
import { assertLossless } from './lossless-check.mjs'

function tool(load: () => Promise<{ state: unknown }>) {
  const registered: any[] = []
  const ctx = { inject: (_d: string[], cb: (sub: Record<string, unknown>) => void) => cb({ tools: { register: (t: unknown) => registered.push(t) } }) }
  // resolveDefineTool() finds the real defineTool when a DSH install is reachable; either way the definition is what ships.
  registerProjectSearch(ctx as never, load as never)
  return registered[0]
}

describe('project_search results are lossless JSON', () => {
  it('covers every path', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rail-lossless-'))
    try {
      mkdirSync(join(dir, 'proj'))
      writeFileSync(join(dir, 'proj', 'a.md'), '# Plan\nthe quick brown fox\njumps over the lazy dog\n')
      writeFileSync(join(dir, 'proj', 'b.txt'), 'nothing relevant here\n')
      writeFileSync(join(dir, 'proj', 'empty.md'), '')
      const states: Record<string, unknown> = {
        withProject: { projects: { p1: { id: 'p1', name: 'Proj', dir: join(dir, 'proj') } }, memberships: {}, docs: { d1: { projectId: 'p1', pointer: join(dir, 'missing.pdf') }, d2: { projectId: 'p1', pointer: 'https://example.com/x' } } },
        nameless: { projects: { p1: { id: 'p1', dir: join(dir, 'proj') } }, memberships: {}, docs: {} },
        noProject: { projects: {}, memberships: {}, docs: {} },
        nullState: null,
      }
      let any = 0
      for (const [label, state] of Object.entries(states)) {
        const t = tool(async () => ({ state }))
        if (t === undefined) return // no DSH install reachable: nothing to compile against
        for (const args of [{ query: 'fox' }, { query: 'zzzzzz' }, { query: '' }, {}, { query: 'fox', limit: 1 }, { query: 'fox', limit: 0 }, { query: 'fox', limit: 1e9 }, { query: 'fox', limit: Number.NaN }]) {
          const exec = { agent: { session: { header: { cwd: join(dir, 'proj'), id: 's1' } } } }
          for (const e of [exec, undefined]) {
            let out: unknown
            try { out = await t.execute(args, e) } catch (err) { if (String((err as Error)?.name) === 'ToolArgsError') continue; throw err } // arguments the core would refuse never reach a result
            await assertLossless(out, `${label} ${JSON.stringify(args)}`); any++
          }
        }
      }
      const bad = tool(async () => { throw new Error('state store unreadable') })
      await assertLossless(await bad.execute({ query: 'x' }, {}), 'load throws'); any++
      const weird = tool(async () => { throw undefined })
      await assertLossless(await weird.execute({ query: 'x' }, {}), 'load throws undefined'); any++
      expect(any).toBeGreaterThan(20)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
