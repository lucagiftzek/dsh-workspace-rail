import { describe, expect, it } from 'vitest'
import { composeAgentsMd, instructionsPreview, MEMORY_FILE } from '../src/instructions.ts'

describe('project instructions -> AGENTS.md', () => {
  it('is empty when nothing is set, so no file is written', () => {
    expect(composeAgentsMd({ name: 'P' })).toBe('')
  })
  it('includes the instructions, the files-only rule and the memory rule', () => {
    const md = composeAgentsMd({ name: 'Legal', instructions: 'Cite GDPR articles.', strict: true, memory: true })
    expect(md.startsWith('# Project: Legal')).toBe(true)
    expect(md).toContain('Cite GDPR articles.')
    expect(md).toContain('Answer only from the files in this project folder')
    expect(md).toContain(MEMORY_FILE)
  })
  it('previews the first real line', () => {
    expect(instructionsPreview('\n\n  Be brief.\nMore')).toBe('Be brief.')
  })
})
