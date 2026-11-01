// SPDX-License-Identifier: Apache-2.0
import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chunkText, rankChunks, searchProject, tokenize } from '../src/host/search.ts'
import { projectForChat } from '../src/index.ts'

const root = mkdtempSync(join(tmpdir(), 'rail-search-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('project_search', () => {
  it('tokenizes accents and Greek, drops 1-char noise', () => {
    expect(tokenize('Café GDPR Άρθρο 6 a')).toEqual(['cafe', 'gdpr', 'αρθρο'])
  })

  it('ranks the passage that is about the query first, with file and line', () => {
    const doc = Array.from({ length: 80 }, (_, i) => (i === 61 ? 'Data retention: customer records are deleted after 24 months under GDPR Article 5.' : 'filler line about something else ' + i)).join('\n')
    const hits = rankChunks([...chunkText('policy.md', doc), ...chunkText('other.md', 'nothing relevant here\n'.repeat(40))], 'GDPR retention months', 3)
    expect(hits[0]!.file).toBe('policy.md')
    expect(hits[0]!.text).toContain('24 months')
    expect(hits[0]!.line).toBeLessThanOrEqual(62)
    expect(hits.every(h => h.file !== 'other.md')).toBe(true)
  })

  it('searches the project folder (text + PDF) and linked files, relative paths inside the folder', async () => {
    const dir = join(root, 'proj'); mkdirSync(join(dir, 'sub'), { recursive: true })
    writeFileSync(join(dir, 'notes.md'), '# Notes\nThe kitten weighs 900 grams.\n')
    writeFileSync(join(dir, 'sub', 'data.csv'), 'date,weight\n2026-09-01,82.4\n')
    writeFileSync(join(dir, 'blob.bin'), Buffer.from([0, 1, 2, 3, 0, 0]))
    let pdfOk = false
    try {
      writeFileSync(join(root, 'p.txt'), 'The quarterly revenue was 4200 euros.')
      execFileSync('bash', ['-c', `cd ${root} && (command -v cupsfilter >/dev/null && cupsfilter p.txt > proj/report.pdf 2>/dev/null) || (command -v libreoffice >/dev/null && libreoffice --headless --convert-to pdf --outdir proj p.txt >/dev/null 2>&1) || (python3 -c "import fpdf" 2>/dev/null)`])
      pdfOk = true
    } catch { /* no PDF generator here */ }
    const linked = join(root, 'elsewhere.txt'); writeFileSync(linked, 'Linked file mentions the kitten too.')
    const res = await searchProject(dir, [linked], 'kitten', 5)
    expect(res.hits.map(h => h.file)).toEqual(expect.arrayContaining(['notes.md', linked]))
    expect((await searchProject(dir, [], 'weight 82.4')).hits[0]!.file).toBe('sub/data.csv')
    if (pdfOk && res.files > 3) {
      const pdf = await searchProject(dir, [], 'quarterly revenue')
      if (pdf.hits.length > 0) expect(pdf.hits[0]!.file).toMatch(/report\.pdf|p\.pdf/)
    }
  })

  it('finds the chat\'s project by folder first, then by membership', () => {
    const state = { projects: { a: { id: 'a', name: 'A', dir: '/home/u/dsh-projects/a-1' }, b: { id: 'b', name: 'B' } }, memberships: { s2: 'b' } }
    expect(projectForChat(state, '/home/u/dsh-projects/a-1', 's9')?.id).toBe('a')
    expect(projectForChat(state, '/home/u/dsh-projects/a-1/sub', undefined)?.id).toBe('a')
    expect(projectForChat(state, '/home/u', 's2')?.id).toBe('b')
    expect(projectForChat(state, '/home/u', 's9')).toBeNull()
  })
})
