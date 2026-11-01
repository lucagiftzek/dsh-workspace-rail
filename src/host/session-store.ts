// SPDX-License-Identifier: Apache-2.0
/**
 * Session-store adapter: resolves session ids to transcript files under
 * ~/.dsh/sessions/<flattened-cwd>/<uuid>/session.jsonl.zstd and extracts
 * search windows with bounded reads (head slice for first messages, tail
 * slice for last messages - a 100MB transcript never gets fully decompressed
 * for indexing). The fs face is injectable for tests.
 * @module dsh-workspace-rail/host/session-store
 */
import { readFileSync, readdirSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { extractTexts, type TranscriptWindows } from './transcript.ts'

export interface FsFace {
  readdir(path: string): string[]
  readFile(path: string): Buffer
}

export interface SessionStoreOptions {
  /** Sessions root; defaults to ~/.dsh/sessions. */
  root?: string
  fs?: FsFace
  headBytes?: number
  tailBytes?: number
}

const DEFAULT_FS: FsFace = { readdir: readdirSync, readFile: readFileSync }

export class SessionStore {
  private readonly root: string
  private readonly fs: FsFace
  private readonly headBytes: number
  private readonly tailBytes: number

  constructor(options: SessionStoreOptions = {}) {
    this.root = options.root ?? join(homedir(), '.dsh', 'sessions')
    this.fs = options.fs ?? DEFAULT_FS
    this.headBytes = options.headBytes ?? 8 * 1024 * 1024
    this.tailBytes = options.tailBytes ?? 8 * 1024 * 1024
  }

  /** List known session ids (uuid directory names, any cwd bucket). */
  listIds(): string[] {
    const ids: string[] = []
    let buckets: string[] = []
    try { buckets = this.fs.readdir(this.root) } catch { return ids }
    for (const bucket of buckets) {
      let entries: string[] = []
      try { entries = this.fs.readdir(join(this.root, bucket)) } catch { continue }
      for (const entry of entries) ids.push(entry)
    }
    return ids
  }

  /** Resolve one session id to its transcript path (null when absent). */
  pathFor(id: string): string | null {
    let buckets: string[] = []
    try { buckets = this.fs.readdir(this.root) } catch { return null }
    for (const bucket of buckets) {
      const candidate = join(this.root, bucket, id, 'session.jsonl.zstd')
      try {
        this.fs.readFile(candidate)
        return candidate
      } catch { /* next bucket */ }
    }
    return null
  }

  /**
   * Search windows for one session. Head slice yields first messages, tail
   * slice (walked backwards) yields last messages. Truncated boundary frames
   * are skipped by design - windows are previews, not archives.
   */
  readWindows(id: string, perWindow = 3): TranscriptWindows | null {
    const path = this.pathFor(id)
    if (path === null) return null
    let data: Buffer
    try { data = this.fs.readFile(path) } catch { return null }
    const first = this.headTexts(data, perWindow)
    const last = this.tailTexts(data, perWindow)
    return { first, last }
  }

  /**
   * Head texts with early exit: stop decompressing as soon as perWindow
   * texts are found (sync per-frame decompress costs ~4ms - unbounded reads
   * of 16k-frame heads cost a minute; early exit costs milliseconds).
   */
  private headTexts(data: Buffer, perWindow: number): string[] {
    const head = data.length <= this.headBytes ? data : data.subarray(0, this.headBytes)
    const starts = frameStartsOf(head)
    const texts: string[] = []
    for (let k = 0; k < starts.length - 1 && texts.length < perWindow && k < 500; k++) {
      let chunk = ''
      try { chunk = decompressSafe(head.subarray(starts[k], starts[k + 1])) } catch { continue }
      for (const text of extractTexts(chunk)) {
        texts.push(text)
        if (texts.length >= perWindow) break
      }
    }
    return texts
  }

  /**
   * Tail texts, walked backwards with early exit; bounded at 4000 frames
   * (tool-call-heavy tails may hide the last text message deep - beyond the
   * cap the window simply misses, which is acceptable for previews).
   */
  private tailTexts(data: Buffer, perWindow: number): string[] {
    const tail = data.length <= this.tailBytes ? data : data.subarray(data.length - this.tailBytes)
    const starts = frameStartsOf(tail)
    const texts: string[] = []
    let scanned = 0
    for (let k = starts.length - 2; k >= 0 && texts.length < perWindow && scanned < 4000; k--) {
      scanned++
      let chunk = ''
      try { chunk = decompressSafe(tail.subarray(starts[k], starts[k + 1])) } catch { continue }
      const found = extractTexts(chunk)
      for (let f = found.length - 1; f >= 0 && texts.length < perWindow; f--) texts.unshift(found[f])
    }
    return texts
  }
}

function frameStartsOf(data: Buffer): number[] {
  const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
  const starts = [0]
  for (let i = 1; i < data.length - 4; i++) {
    if (data[i] === magic[0] && data[i + 1] === magic[1] && data[i + 2] === magic[2] && data[i + 3] === magic[3]) starts.push(i)
  }
  starts.push(data.length)
  return starts
}

function decompressSafe(seg: Buffer): string {
  return zstdDecompressSync(seg).toString()
}