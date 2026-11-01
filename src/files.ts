// SPDX-License-Identifier: Apache-2.0
/**
 * Project-file input helpers (pure): turn whatever the user pastes or drops
 * into pointers, and infer the display name and kind so adding a file is one
 * step: no kind picker, no separate name field.
 * @module dsh-workspace-rail/files
 */
import type { DocKind } from './projects.ts'

const DATA_EXT = new Set(['json', 'jsonl', 'ndjson', 'csv', 'tsv', 'yaml', 'yml', 'toml', 'xml', 'sql', 'parquet', 'xlsx', 'xls', 'db', 'sqlite'])
const SNIPPET_EXT = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'go', 'rs', 'sh', 'bash', 'zsh', 'rb', 'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'swift', 'lua', 'css', 'scss', 'vue', 'svelte'])
// .html/.htm stay documents: here they are reports and pages, not source.

/** True for http(s) links; everything else is treated as a host path. */
export function isUrl(pointer: string): boolean {
  return /^https?:\/\//i.test(pointer)
}

/**
 * Split pasted/dropped text into pointers: one per line, surrounding quotes
 * stripped, `file://` URIs decoded to paths, comment lines (text/uri-list `#`)
 * and blanks dropped, duplicates removed (order kept).
 */
export function parsePointers(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    let s = raw.trim()
    if (s.length === 0 || s.startsWith('#')) continue
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1).trim()
    if (/^file:\/\//i.test(s)) {
      try { s = decodeURIComponent(new URL(s).pathname) } catch { continue }
    }
    if (s.length === 0 || out.includes(s)) continue
    out.push(s)
  }
  return out
}

/** Display name: the last path segment (or host for a bare URL). */
export function docNameFor(pointer: string): string {
  if (isUrl(pointer)) {
    try {
      const u = new URL(pointer)
      const seg = u.pathname.split('/').filter(Boolean).pop()
      return seg !== undefined ? decodeURIComponent(seg) : u.hostname
    } catch { return pointer }
  }
  const seg = pointer.replace(/[\\/]+$/, '').split(/[\\/]/).pop()
  return seg !== undefined && seg.length > 0 ? seg : pointer
}

/** Kind from the extension: data files, code snippets, everything else a document. */
export function docKindFor(pointer: string): DocKind {
  if (isUrl(pointer)) return 'document'
  const m = /\.([a-z0-9]+)$/i.exec(docNameFor(pointer))
  const ext = m?.[1]?.toLowerCase() ?? ''
  if (DATA_EXT.has(ext)) return 'data'
  if (SNIPPET_EXT.has(ext)) return 'snippet'
  return 'document'
}

/** The folder part of a path, shortened for a one-line hint (`~/…/dir`). */
export function shortDir(pointer: string, max = 34): string {
  if (isUrl(pointer)) {
    try { return new URL(pointer).hostname } catch { return '' }
  }
  const parts = pointer.split(/[\\/]/)
  parts.pop()
  let dir = parts.join('/')
  dir = dir.replace(/^\/home\/[^/]+/, '~')
  if (dir.length <= max) return dir
  return '…' + dir.slice(dir.length - max + 1)
}
