// SPDX-License-Identifier: Apache-2.0
// project_search once failed dsh's schema validation at registration
// ("additionalProperties must be explicitly true or false") and was silently
// missing from every chat. Validate the definition against dsh's real
// defineTool so that can never ship again.
import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { registerProjectSearch } from '../src/index.ts'

const probe = join(homedir(), '.dsh', 'profiles', 'web', 'probe.js')
const haveDsh = (() => { try { createRequire(probe)('@deepseek-ai/dsh-tools'); return true } catch { return false } })()

describe.skipIf(!haveDsh || !existsSync(join(homedir(), '.dsh')))('project_search definition', () => {
  it('passes dsh defineTool validation and registers', () => {
    const registered: unknown[] = []
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ctx = { inject: (_deps: string[], cb: (sub: Record<string, unknown>) => void) => cb({ tools: { register: (t: unknown) => registered.push(t) } }) }
    registerProjectSearch(ctx as never, async () => ({ state: null }))
    const msgs = errors.mock.calls.map(c => String(c[0]))
    errors.mockRestore()
    expect(msgs).toEqual([])
    expect(registered).toHaveLength(1)
  })
})
