// SPDX-License-Identifier: Apache-2.0
/**
 * Host-side transcript reading (pure where possible). DSH session logs are
 * JSONL compressed as CONCATENATED zstd frames (one frame per append batch),
 * so a naive single-frame decompress sees only the session header. The frame
 * splitter scans frame magics and decompresses segment-wise, merging on the
 * rare false-positive magic inside compressed payload.
 * @module dsh-workspace-rail/host/transcript
 */
import { zstdDecompressSync } from 'node:zlib'

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/** Frame boundaries (offsets) of a concatenated zstd stream. */
export function frameStarts(data: Buffer): number[] {
  const starts = [0]
  for (let i = 1; i < data.length - 4; i++) {
    if (data[i] === ZSTD_MAGIC[0] && data[i + 1] === ZSTD_MAGIC[1] && data[i + 2] === ZSTD_MAGIC[2] && data[i + 3] === ZSTD_MAGIC[3]) starts.push(i)
  }
  starts.push(data.length)
  return starts
}

/** Decompress up to maxFrames frames of a concatenated zstd stream. */
export function frameDecompress(data: Buffer, maxFrames = Number.POSITIVE_INFINITY): string {
  const starts = frameStarts(data)
  let out = ''
  let done = 0
  for (let k = 0; k < starts.length - 1 && done < maxFrames; k++) {
    let chunk: string
    try {
      chunk = zstdDecompressSync(data.subarray(starts[k], starts[k + 1])).toString()
    } catch { /* false-positive magic: merged away by the next segment */ continue }
    // On-disk JSONL frames end with \n; synthetic or truncated frames may
    // not - keep the line stream coherent either way.
    if (out.length > 0 && !out.endsWith('\n') && !chunk.startsWith('\n')) out += '\n'
    out += chunk
    done++
  }
  return out
}

/** One text block, capped (search indexes previews, not full messages). */
const TEXT_CAP = 200

/** Pull user + assistant TEXT blocks (tool calls excluded) in seq order. */
export function extractTexts(jsonl: string, cap = TEXT_CAP): string[] {
  const texts: string[] = []
  for (const line of jsonl.split('\n')) {
    if (line.length === 0) continue
    let event: any
    try { event = JSON.parse(line) } catch { continue }
    if (event === null || typeof event !== 'object') continue
    let blocks: any[] | undefined
    if (event.type === 'user/message') blocks = event.data?.content
    else if (event.type === 'assistant/message') blocks = event.data?.message?.content
    if (!Array.isArray(blocks)) continue
    for (const block of blocks) {
      if (block?.type === 'text' && typeof block.text === 'string' && block.text.trim().length > 0) {
        texts.push(block.text.length > cap ? block.text.slice(0, cap) : block.text)
      }
    }
  }
  return texts
}

export interface TranscriptWindows {
  /** First N text blocks (initial scope/prompt context). */
  first: string[]
  /** Last N text blocks (latest state). */
  last: string[]
}

/** First/last N text blocks of a transcript. */
export function extractWindows(jsonl: string, perWindow = 3): TranscriptWindows {
  const texts = extractTexts(jsonl)
  return { first: texts.slice(0, perWindow), last: texts.slice(Math.max(0, texts.length - perWindow)) }
}