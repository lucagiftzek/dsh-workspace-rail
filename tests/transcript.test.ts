// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { zstdCompressSync } from 'node:zlib'
import { extractTexts, extractWindows, frameDecompress, frameStarts } from '../src/host/transcript.ts'

const userMsg = (text: string): string => JSON.stringify({ type: 'user/message', seq: 1, time: 1, data: { content: [{ type: 'text', text }] } })
const asstMsg = (text: string): string => JSON.stringify({ type: 'assistant/message', seq: 2, time: 2, data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'tool-call', id: 't1', name: 'bash' }, { type: 'text', text }] } } })
const header = JSON.stringify({ type: 'session', version: 0, id: 'x', createdAt: 1 })

describe('frameDecompress', () => {
  it('decodes concatenated frames (the real on-disk format)', () => {
    const frames = [header, userMsg('hello'), asstMsg('done')].map(l => zstdCompressSync(Buffer.from(l)))
    const blob = Buffer.concat(frames)
    expect(frameStarts(blob).length - 1).toBe(3)
    const text = frameDecompress(blob)
    expect(text.split('\n')).toHaveLength(3)
  })

  it('respects maxFrames (bounded head reads)', () => {
    const frames = [header, userMsg('a'), userMsg('b'), userMsg('c')].map(l => zstdCompressSync(Buffer.from(l)))
    const text = frameDecompress(Buffer.concat(frames), 2)
    expect(text.split('\n')).toHaveLength(2)
  })
})

describe('extractTexts / extractWindows', () => {
  it('collects user and assistant text blocks in order, skipping tool calls', () => {
    const jsonl = [header, userMsg('first question'), asstMsg('working on it'), userMsg('second question')].join('\n')
    expect(extractTexts(jsonl)).toEqual(['first question', 'working on it', 'second question'])
  })

  it('windows carry first 3 and last 3', () => {
    const lines = [header]
    for (let i = 0; i < 6; i++) lines.push(userMsg('msg ' + i))
    const win = extractWindows(lines.join('\n'))
    expect(win.first).toEqual(['msg 0', 'msg 1', 'msg 2'])
    expect(win.last).toEqual(['msg 3', 'msg 4', 'msg 5'])
  })

  it('caps per-text length and survives malformed lines', () => {
    const long = 'x'.repeat(500)
    const jsonl = [userMsg(long), 'not json at all', '[]', userMsg('ok')].join('\n')
    const texts = extractTexts(jsonl)
    expect(texts[0].length).toBe(200)
    expect(texts[1]).toBe('ok')
  })
})
