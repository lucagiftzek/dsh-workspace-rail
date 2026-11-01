// SPDX-License-Identifier: Apache-2.0
/**
 * project_search: ranked full-text search over one project's files (host side).
 *
 * The retrieval piece Claude/Mistral/Gemini projects use once a project
 * outgrows the context window: the assistant asks for passages instead of
 * reading every file. Scope = the project folder plus the project's linked
 * paths. Text/code files are read directly, PDFs through `pdftotext`, .docx
 * by unpacking word/document.xml. Passages are ~30-line chunks ranked with
 * BM25; each hit carries file + line so answers can cite it. Extraction is
 * cached per path by (size, mtime).
 * @module dsh-workspace-rail/host/search
 */
import { execFile } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'

const TEXT_EXT = new Set(['md', 'markdown', 'txt', 'text', 'rst', 'org', 'csv', 'tsv', 'json', 'jsonl', 'ndjson', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'xml', 'html', 'htm', 'css', 'scss', 'sql', 'log', 'env.example',
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'go', 'rs', 'sh', 'bash', 'zsh', 'rb', 'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'swift', 'lua', 'vue', 'svelte', 'tex', 'bib', 'srt', 'vtt'])
const SKIP_DIRS = new Set(['node_modules', '.git', '.venv', 'venv', '__pycache__', 'dist', 'build', '.next', '.cache'])
const MAX_FILE_BYTES = 25 * 1024 * 1024
const MAX_FILES = 2000
const CHUNK_LINES = 30
const CHUNK_OVERLAP = 5

export interface SearchHit { file: string; line: number; score: number; text: string }
export interface Chunk { file: string; line: number; text: string; terms: Map<string, number>; len: number }

/** Lowercase word tokens (letters/digits, incl. accented and Greek), 2+ chars. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[\p{L}\p{N}]{2,}/gu) ?? [])
}

/** Split a document into overlapping line windows. */
export function chunkText(file: string, text: string): Chunk[] {
  const lines = text.split(/\r?\n/)
  const out: Chunk[] = []
  for (let start = 0; start < lines.length; start += CHUNK_LINES - CHUNK_OVERLAP) {
    const body = lines.slice(start, start + CHUNK_LINES).join('\n')
    if (body.trim().length === 0) continue
    const toks = tokenize(body)
    const terms = new Map<string, number>()
    for (const t of toks) terms.set(t, (terms.get(t) ?? 0) + 1)
    out.push({ file, line: start + 1, text: body, terms, len: toks.length })
    if (start + CHUNK_LINES >= lines.length) break
  }
  return out
}

/** Okapi BM25 over chunks (k1 1.2, b 0.75); ties broken by earlier file/line. */
export function rankChunks(chunks: readonly Chunk[], query: string, limit: number): SearchHit[] {
  const q = [...new Set(tokenize(query))]
  if (q.length === 0 || chunks.length === 0) return []
  const N = chunks.length
  const avg = chunks.reduce((s, c) => s + c.len, 0) / N || 1
  const df = new Map<string, number>()
  for (const t of q) df.set(t, chunks.reduce((n, c) => n + (c.terms.has(t) ? 1 : 0), 0))
  const scored: SearchHit[] = []
  for (const c of chunks) {
    let score = 0
    for (const t of q) {
      const f = c.terms.get(t) ?? 0
      if (f === 0) continue
      const n = df.get(t) ?? 0
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      score += idf * (f * 2.2) / (f + 1.2 * (1 - 0.75 + 0.75 * c.len / avg))
    }
    if (score > 0) scored.push({ file: c.file, line: c.line, score: Math.round(score * 100) / 100, text: c.text })
  }
  scored.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || a.line - b.line)
  return scored.slice(0, Math.max(1, Math.min(limit, 30)))
}

// ---- extraction ------------------------------------------------------------------

function run(cmd: string, args: string[], timeoutMs = 20_000): Promise<string> {
  return new Promise((ok, fail) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' }, (err, stdout) => (err ? fail(err) : ok(stdout)))
  })
}

const cache = new Map<string, { key: string; text: string | null }>()

/** Extract searchable text from one file, or null when it is not text we can read. */
export async function extractText(path: string): Promise<string | null> {
  let st
  try { st = await fsp.stat(path) } catch { return null }
  if (!st.isFile() || st.size === 0 || st.size > MAX_FILE_BYTES) return null
  const key = st.size + ':' + st.mtimeMs
  const hit = cache.get(path)
  if (hit !== undefined && hit.key === key) return hit.text
  const ext = extname(path).slice(1).toLowerCase()
  let text: string | null = null
  try {
    if (ext === 'pdf') text = await run('pdftotext', ['-layout', '-q', path, '-'])
    else if (ext === 'docx') text = (await run('unzip', ['-p', path, 'word/document.xml'])).replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    else if (TEXT_EXT.has(ext) || ext === '') {
      const buf = await fsp.readFile(path)
      // Unknown extension: accept only if it looks like text (no NUL in the head).
      if (ext === '' && buf.subarray(0, 4096).includes(0)) text = null
      else text = buf.toString('utf8')
    }
  } catch { text = null }
  cache.set(path, { key, text })
  if (cache.size > 5000) cache.delete(cache.keys().next().value!)
  return text
}

/** Every searchable file under `roots` (folders walked, files taken as-is). */
export async function collectFiles(roots: readonly string[]): Promise<string[]> {
  const out: string[] = []
  const seen = new Set<string>()
  const walk = async (p: string, depth: number): Promise<void> => {
    if (out.length >= MAX_FILES || seen.has(p)) return
    seen.add(p)
    let st
    try { st = await fsp.stat(p) } catch { return }
    if (st.isFile()) { out.push(p); return }
    if (!st.isDirectory() || depth > 8) return
    let names: string[] = []
    try { names = await fsp.readdir(p) } catch { return }
    for (const n of names.sort()) {
      if (n.startsWith('.') || SKIP_DIRS.has(n)) continue
      await walk(join(p, n), depth + 1)
    }
  }
  for (const r of roots) await walk(r, 0)
  return out
}

/** Search the project: returns ranked hits with paths shown relative to the project folder when inside it. */
export async function searchProject(dir: string | null, linked: readonly string[], query: string, limit = 8): Promise<{ hits: SearchHit[]; files: number; unreadable: string[] }> {
  const roots = [...(dir !== null ? [dir] : []), ...linked]
  const files = await collectFiles(roots)
  const chunks: Chunk[] = []
  const unreadable: string[] = []
  for (const f of files) {
    const text = await extractText(f)
    if (text === null) { unreadable.push(basename(f)); continue }
    const shown = dir !== null && f.startsWith(dir + '/') ? relative(dir, f) : f
    chunks.push(...chunkText(shown, text))
  }
  return { hits: rankChunks(chunks, query, limit), files: files.length, unreadable: unreadable.slice(0, 20) }
}
