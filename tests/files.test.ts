import { describe, expect, it } from 'vitest'
import { docKindFor, docNameFor, parsePointers, shortDir } from '../src/files.ts'

describe('project file input', () => {
  it('parses pasted paths, quotes, file:// URIs and uri-list comments', () => {
    expect(parsePointers(' "/home/u/a b.md" \n\n# comment\nfile:///srv/data/x%20y.csv\nhttps://x.org/p.pdf\n/home/u/a b.md'))
      .toEqual(['/home/u/a b.md', '/srv/data/x y.csv', 'https://x.org/p.pdf'])
  })
  it('names by last segment and infers kind by extension', () => {
    expect(docNameFor('/opt/app/src/main.go')).toBe('main.go')
    expect(docNameFor('/opt/app/docs/')).toBe('docs')
    expect(docNameFor('https://acme.example.com/legal/terms')).toBe('terms')
    expect(docNameFor('https://acme.example.com/')).toBe('acme.example.com')
    expect(docKindFor('/x/report.md')).toBe('document')
    expect(docKindFor('/x/rows.CSV')).toBe('data')
    expect(docKindFor('/x/run.py')).toBe('snippet')
    expect(docKindFor('https://x.org/a.json')).toBe('document')
  })
  it('shortens the folder hint and folds the home dir', () => {
    expect(shortDir('/home/alice/reports/a.md')).toBe('~/reports')
    expect(shortDir('/very/long/path/that/keeps/going/and/going/file.txt', 20)).toMatch(/^….{19}$/)
  })
})
