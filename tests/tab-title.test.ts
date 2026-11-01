// @vitest-environment jsdom
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import {
  cleanText, computeTabTitle, createSeenTracker, lastMessageText, lastReplyText, NO_CHAT_TITLE, normalizeTitle, snippet, TAB_FRAMES,
  type TabTitleInput,
} from '../src/tab-title.ts'
import { createTabChrome } from '../src/tab-chrome.ts'
import { createActivityTracker } from '../src/recents-order.ts'

const DASH_RE = /[\u2013\u2014]/
const base = (over: Partial<TabTitleInput> = {}): TabTitleInput => ({ unread: [], current: null, frame: 0, ...over })

describe('tab title precedence', () => {
  it('1. unread wins over everything: count + newest unread reply', () => {
    const r = computeTabTitle(base({
      unread: [
        { id: 'a', completedAt: 100, text: 'Older reply here', title: 'A' },
        { id: 'b', completedAt: 300, text: 'The phone sidebar is ready to test now', title: 'B' },
        { id: 'c', completedAt: 200, text: 'Middle', title: 'C' },
      ],
      current: { id: 'x', running: false, text: 'whatever', title: 'X' },
    }))
    expect(r.kind).toBe('unread')
    expect(r.title).toBe('(3) The phone sidebar is ready to...')
    expect(r.animate).toBe(false)
  })
  it('1. unread without text falls back to the chat title', () => {
    expect(computeTabTitle(base({ unread: [{ id: 'a', completedAt: 1, text: '', title: 'Twilio phone' }] })).title).toBe('(1) Twilio phone')
  })
  it('2. no chat open', () => {
    const r = computeTabTitle(base())
    expect(r).toEqual({ title: NO_CHAT_TITLE, kind: 'no-chat', animate: false })
    expect(NO_CHAT_TITLE).toBe('DeepSeek Harness')
  })
  it('3. open chat working: animation frames, cycling', () => {
    const titles = [0, 1, 2, 3, 4, -1].map(frame => computeTabTitle(base({ frame, current: { id: 'x', running: true, text: 'Hi', title: 'X' } })))
    expect(titles.every(t => t.kind === 'working' && t.animate)).toBe(true)
    expect(titles.map(t => t.title)).toEqual([TAB_FRAMES[0], TAB_FRAMES[1], TAB_FRAMES[2], TAB_FRAMES[3], TAB_FRAMES[0], TAB_FRAMES[3]])
  })
  it('4. open chat idle: start of its last message', () => {
    const r = computeTabTitle(base({ current: { id: 'x', running: false, text: 'OK', title: 'Scratch' } }))
    expect(r).toEqual({ title: 'OK', kind: 'idle', animate: false })
    expect(computeTabTitle(base({ current: { id: 'x', running: false, text: '', title: 'Scratch chat' } })).title).toBe('Scratch chat')
  })
})

describe('animation frames', () => {
  it('start from the kitty with the integral tail, one line, readable, no dashes', () => {
    expect(TAB_FRAMES[0]).toBe('=^._.^= ∫')
    expect(TAB_FRAMES.length).toBeGreaterThanOrEqual(3)
    expect(new Set(TAB_FRAMES).size).toBe(TAB_FRAMES.length)
    for (const f of TAB_FRAMES) {
      expect(f).not.toMatch(/\n/)
      expect(f).not.toMatch(DASH_RE)
      expect(f.length).toBeLessThanOrEqual(12)
      expect(f.startsWith('=^')).toBe(true)
    }
    expect(TAB_FRAMES).toContain('=^-.-^= ∫')
    expect(TAB_FRAMES).toContain('=^._.^= ʃ')
  })
  it('the shifted tail survives document.title whitespace collapsing', () => {
    const shifted = TAB_FRAMES[1]!
    expect(normalizeTitle(shifted)).toBe(shifted)
    document.title = shifted
    expect(document.title).toBe(shifted)
    expect(document.title).not.toBe(TAB_FRAMES[0])
  })
})

describe('trimming', () => {
  it('about 6 words', () => {
    expect(snippet('one two three four five six seven eight')).toBe('one two three four five six...')
    expect(snippet('one two three')).toBe('one two three')
  })
  it('about 40 characters, cut on a word boundary', () => {
    const s = snippet('Internationalization considerations notwithstanding everything')
    expect(s.endsWith('...')).toBe(true)
    expect(s.length).toBeLessThanOrEqual(43)
    expect(s).toBe('Internationalization considerations...')
  })
  it('one huge word is hard cut', () => {
    const s = snippet('x'.repeat(100))
    expect(s).toBe('x'.repeat(40) + '...')
  })
  it('the host ellipsis is replaced by our marker, trailing punctuation dropped', () => {
    expect(snippet('All done, the build is gree…')).toBe('All done, the build is gree')
    expect(snippet('Done. Next: deploy, test, report, and then rest')).toBe('Done. Next: deploy, test, report, and...')
  })
  it('markdown marks and newlines go', () => {
    expect(snippet('## **Result**\n`lib/client.js` is [rebuilt](http://x)')).toBe('Result lib/client.js is rebuilt')
  })
  it('empty text is empty', () => {
    expect(snippet('   ')).toBe('')
    expect(snippet(undefined as unknown as string)).toBe('')
  })
})

describe('dash stripping', () => {
  it('em and en dashes between words become a comma', () => {
    expect(cleanText('Done \u2014 tests pass')).toBe('Done, tests pass')
    expect(cleanText('Done\u2014tests pass')).toBe('Done, tests pass')
    expect(cleanText('pages 3\u20135')).toBe('pages 3, 5')
  })
  it('leading, trailing and doubled dashes vanish', () => {
    expect(cleanText('\u2014 hello')).toBe('hello')
    expect(cleanText('hello \u2014')).toBe('hello')
    expect(cleanText('a \u2014\u2014 b')).toBe('a, b')
    expect(cleanText('a, \u2014 b')).toBe('a, b')
  })
  it('no title ever carries one', () => {
    const nasty = 'Result \u2014 fine \u2013 ok \u2015 yes \u2012 figure \uFF0D wide'
    for (const t of [
      computeTabTitle(base({ unread: [{ id: 'a', completedAt: 1, text: nasty, title: 'A \u2014 B' }] })).title,
      computeTabTitle(base({ current: { id: 'x', running: false, text: nasty, title: 'T' } })).title,
      computeTabTitle(base({ current: { id: 'x', running: false, text: '', title: 'Title \u2014 with dash' } })).title,
    ]) {
      expect(t).not.toMatch(/[\u2012-\u2015\uFF0D]/)
    }
  })
  it('plain hyphens inside words stay', () => {
    expect(cleanText('sign-in works')).toBe('sign-in works')
  })
})

describe('message text from the turn outline', () => {
  const turns = [{ prompt: 'first q', response: 'first answer' }, { prompt: 'Reply with exactly: OK', response: '' }]
  it('last message: the last reply, else the last prompt', () => {
    expect(lastMessageText(turns)).toBe('Reply with exactly: OK')
    expect(lastMessageText([...turns.slice(0, 1), { prompt: 'q2', response: 'OK' }])).toBe('OK')
    expect(lastMessageText(undefined)).toBe('')
  })
  it('newest reply skips a turn that has none yet', () => {
    expect(lastReplyText(turns)).toBe('first answer')
    expect(lastReplyText([{ prompt: 'only a prompt', response: '' }])).toBe('only a prompt')
  })
})

describe('unread = completion beyond the seen stamp', () => {
  const mem = () => {
    const box: { v: Record<string, number> | null } = { v: null }
    return { box, load: () => box.v, save: (s: Record<string, number>) => { box.v = { ...s } } }
  }
  it('first run seeds every known completion as read', () => {
    const m = mem()
    const t = createSeenTracker({ ...m, seed: () => ({ a: 100, b: 200 }) })
    expect(t.isUnread('a', 100)).toBe(false)
    expect(t.isUnread('b', 200)).toBe(false)
    expect(m.box.v).toEqual({ a: 100, b: 200 })
    expect(t.isUnread('a', 50_000)).toBe(true)
  })
  it('a chat never seen with a completion is unread; no completion is never unread', () => {
    const t = createSeenTracker({ ...mem(), seed: () => ({}) })
    expect(t.isUnread('new', 10)).toBe(true)
    expect(t.isUnread('new', undefined)).toBe(false)
  })
  it('on screen = read through its newest completion; a later completion is unread again', () => {
    const t = createSeenTracker({ ...mem(), seed: () => ({}) })
    expect(t.markSeen('x', 1000)).toBe(true)
    expect(t.markSeen('x', 1000)).toBe(false)
    expect(t.isUnread('x', 1000)).toBe(false)
    expect(t.isUnread('x', 1001)).toBe(true)
  })
  it("another tab's stamp tolerates the few ms between the two tabs' edges", () => {
    const m = mem()
    m.box.v = { x: 1000 }
    const t = createSeenTracker({ ...m })
    expect(t.isUnread('x', 1800)).toBe(false)
    expect(t.isUnread('x', 9000)).toBe(true)
  })
  it('reload picks up stamps another tab wrote', () => {
    const m = mem()
    const t = createSeenTracker({ ...m, seed: () => ({}) })
    expect(t.isUnread('y', 500)).toBe(true)
    m.box.v = { y: 500 }
    t.reload()
    expect(t.isUnread('y', 500)).toBe(false)
  })
  it('works with the Recents tracker: running -> idle while away is unread, while on screen is read', () => {
    let now = 1000
    const activity = createActivityTracker({ now: () => now })
    const seen = createSeenTracker({ ...mem(), seed: () => ({}) })
    activity.observe([{ id: 'away', running: true }, { id: 'here', running: true }])
    now = 2000
    activity.observe([{ id: 'away', running: false }, { id: 'here', running: false }])
    seen.markSeen('here', activity.completedAt('here')!)
    expect(seen.isUnread('away', activity.completedAt('away'))).toBe(true)
    expect(seen.isUnread('here', activity.completedAt('here'))).toBe(false)
  })
})

describe('tab chrome (icons + title guard)', () => {
  const setup = () => {
    document.head.innerHTML = '<title>DeepSeek Harness</title><link rel="icon" href="./favicon-dark.svg" media="(prefers-color-scheme: dark)"><link rel="icon" href="./favicon.svg"><link rel="manifest" href="./m.json">'
    return createTabChrome(document, [
      { rel: 'icon', type: 'image/svg+xml', href: 'data:image/svg+xml,%3Csvg%2F%3E' },
      { rel: 'apple-touch-icon', sizes: '180x180', href: 'data:image/png;base64,AAAA' },
    ])
  }
  it('replaces the shell icons with ours and restores them on stop', () => {
    const c = setup()
    const icons = () => [...document.head.querySelectorAll('link')].filter(l => /icon/.test(l.rel)).map(l => l.getAttribute('href'))
    expect(icons()).toEqual(['data:image/svg+xml,%3Csvg%2F%3E', 'data:image/png;base64,AAAA'])
    expect(document.head.querySelector('link[rel=manifest]')).not.toBeNull()
    c.stop()
    expect(icons()).toEqual(['./favicon-dark.svg', './favicon.svg'])
  })
  it('re-applies the title when the core rewrites it, and is idempotent', async () => {
    const c = setup()
    c.setTitle('Rail title')
    expect(document.title).toBe('Rail title')
    document.title = 'Some chat \u2014 DeepSeek Harness'
    await new Promise(r => setTimeout(r, 0))
    expect(document.title).toBe('Rail title')
    expect(c.foreignTitle()).toBe('Some chat \u2014 DeepSeek Harness')
    // Replacing the <title> element itself is caught too.
    document.head.querySelector('title')!.remove()
    const t = document.createElement('title'); t.textContent = 'DeepSeek Harness'; document.head.appendChild(t)
    await new Promise(r => setTimeout(r, 0))
    expect(document.title).toBe('Rail title')
    c.stop()
    expect(document.title).toBe('DeepSeek Harness')
  })
  it('an icon link added later is parked as well', async () => {
    const c = setup()
    const l = document.createElement('link'); l.rel = 'icon'; l.href = './late.svg'; document.head.appendChild(l)
    await new Promise(r => setTimeout(r, 0))
    expect(document.head.querySelector('link[href="./late.svg"]')).toBeNull()
    c.stop()
    expect(document.head.querySelector('link[href="./late.svg"]')).not.toBeNull()
  })
})
