// SPDX-License-Identifier: Apache-2.0
/**
 * Browser tab title (pure, no DOM, no cordis): what the tab says, in this
 * precedence order:
 *
 * 1. unread replies: "(N) <first words of the newest unread reply>", or
 *    "(N) <kitty frame>" while the open chat is working
 * 2. no chat open: "DeepSeek Harness"
 * 3. the open chat is working: a one-line kitty animation (TAB_FRAMES)
 * 4. the open chat is idle: the first words of its last message
 *
 * Unread is an extension of the Recents tracker (recents-order.ts): a chat is
 * unread when this browser stamped a running to idle edge (completedAt) later
 * than the last time the chat was on screen (seenAt, kept per browser next to
 * the completion stamps). The open chat counts as read while the tab is
 * visible. Message text never carries an em-dash or an en-dash into the title.
 * @module dsh-workspace-rail/tab-title
 */

/** Title when no chat is open. */
export const NO_CHAT_TITLE = 'DeepSeek Harness'

/**
 * Working animation, one line, about 2.5 frames per second. U+00A0 keeps the
 * shifted tail: `document.title` collapses plain spaces.
 */
export const TAB_FRAMES: readonly string[] = [
  '=^._.^= ∫',
  '=^._.^=\u00A0 ∫',
  '=^-.-^= ∫',
  '=^._.^= ʃ',
]
/** Milliseconds per animation frame (background tabs are throttled to about 1 s, which is fine). */
export const FRAME_MS = 400

/** Words and characters of a snippet before it is trimmed with "...". */
export const SNIPPET_WORDS = 6
export const SNIPPET_CHARS = 40

/**
 * Two tabs stamp the same completion a moment apart: a completion within this
 * window after a seen stamp ANOTHER tab wrote is not unread. Stamps this tab
 * wrote itself are exact (no window).
 */
export const SEEN_SKEW_MS = 3000

/** Every dash a title must not carry (figure dash, en, em, horizontal bar, two/three-em, small and fullwidth forms). */
const DASHES = /[\u2012\u2013\u2014\u2015\u2E3A\u2E3B\uFE58\uFE63\uFF0D]/

/**
 * Plain one-line text: markdown marks dropped, dashes replaced by a comma
 * (between words) or a space, whitespace collapsed.
 * @param raw - message text (a projection preview, possibly markdown).
 * @returns cleaned text, '' when nothing readable is left.
 */
export function cleanText(raw: string): string {
  let s = String(raw ?? '')
  s = s.replace(/```[^\n]*\n?/g, ' ')
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  s = s.replace(/(^|\s)#{1,6}\s+/g, '$1')
  s = s.replace(/(^|\s)>\s+/g, '$1')
  s = s.replace(/[*_`~]+/g, '')
  // A dash between words reads as a pause: comma. Anywhere else: a space.
  s = s.replace(new RegExp('(\\S)\\s*' + DASHES.source + '+\\s*(?=\\S)', 'g'), '$1, ')
  s = s.replace(new RegExp(DASHES.source, 'g'), ' ')
  s = s.replace(/[\s\u00A0]+/g, ' ').trim()
  s = s.replace(/^[,;:.\s]+/, '').replace(/\s+,/g, ',').replace(/,(\s*,)+/g, ',')
  // The host clips previews with an ellipsis; snippet() adds its own marker.
  s = s.replace(/(\u2026|\.\.\.)$/, '').trimEnd()
  return s
}

/**
 * The first words of a message: at most SNIPPET_WORDS words and about
 * SNIPPET_CHARS characters, "..." when anything was cut.
 * @param raw - message text.
 * @returns the snippet, '' for empty text.
 */
export function snippet(raw: string, maxWords = SNIPPET_WORDS, maxChars = SNIPPET_CHARS): string {
  const text = cleanText(raw)
  if (text.length === 0) return ''
  const words = text.split(' ')
  let out = words.slice(0, maxWords).join(' ')
  let cut = words.length > maxWords
  if (out.length > maxChars) {
    cut = true
    const head = out.slice(0, maxChars + 1)
    const space = head.lastIndexOf(' ')
    out = space >= Math.floor(maxChars / 2) ? head.slice(0, space) : out.slice(0, maxChars)
  }
  out = out.replace(/[\s,;:.]+$/, '')
  // Never end on a dangling opening bracket or quote.
  out = out.replace(/[([{"'\u201C\u2018]+$/, '').trimEnd()
  return cut ? out + '...' : out
}

/** Latest turn previews of one chat (from the host's `turnOutline` projection). */
export interface OutlineTurn { prompt?: string; response?: string }

/**
 * The newest message of a chat as text: the last turn's reply, else its
 * prompt, else the previous turns'.
 * @param turns - the turnOutline projection value (ascending), or undefined.
 * @returns raw text, '' when the outline has none.
 */
export function lastMessageText(turns: readonly OutlineTurn[] | undefined | null): string {
  if (!Array.isArray(turns)) return ''
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]
    if (typeof t?.response === 'string' && t.response.trim().length > 0) return t.response
    if (typeof t?.prompt === 'string' && t.prompt.trim().length > 0) return t.prompt
  }
  return ''
}

/**
 * The newest REPLY of a chat (an unread title names what the assistant said).
 * @param turns - the turnOutline projection value.
 * @returns the last non-empty response, else lastMessageText().
 */
export function lastReplyText(turns: readonly OutlineTurn[] | undefined | null): string {
  if (!Array.isArray(turns)) return ''
  for (let i = turns.length - 1; i >= 0; i--) {
    const r = turns[i]?.response
    if (typeof r === 'string' && r.trim().length > 0) return r
  }
  return lastMessageText(turns)
}

/** Everything the title depends on, gathered by the client glue. */
export interface TabTitleInput {
  /** Unread chats, any order. */
  unread: ReadonlyArray<{ id: string; completedAt: number; text: string; title: string }>
  /** The chat on screen, or null when none (New Session screen, a global panel). */
  current: { id: string; running: boolean; text: string; title: string } | null
  /** Animation frame counter (any integer). */
  frame: number
}

export interface TabTitleResult {
  title: string
  /** Which precedence rule produced it. */
  kind: 'unread' | 'unread-working' | 'no-chat' | 'working' | 'idle'
  /** True while the working animation should keep ticking. */
  animate: boolean
}

/**
 * The tab title for one moment.
 * @param input - unread chats, the open chat and the frame counter.
 * @returns the title and the rule that produced it.
 */
export function computeTabTitle(input: TabTitleInput): TabTitleResult {
  const frameOf = (i: number): string => { const n = TAB_FRAMES.length; return TAB_FRAMES[((Math.trunc(i) % n) + n) % n]! }
  if (input.unread.length > 0) {
    if (input.current?.running === true) {
      return { title: '(' + input.unread.length + ') ' + frameOf(input.frame), kind: 'unread-working', animate: true }
    }
    let newest = input.unread[0]!
    for (const u of input.unread) if (u.completedAt > newest.completedAt) newest = u
    const words = snippet(newest.text) || snippet(newest.title) || 'new reply'
    return { title: '(' + input.unread.length + ') ' + words, kind: 'unread', animate: false }
  }
  const cur = input.current
  if (cur === null) return { title: NO_CHAT_TITLE, kind: 'no-chat', animate: false }
  if (cur.running) {
    return { title: frameOf(input.frame), kind: 'working', animate: true }
  }
  const words = snippet(cur.text) || snippet(cur.title) || NO_CHAT_TITLE
  return { title: words, kind: 'idle', animate: false }
}

/** What `document.title` reads back for a given value (ASCII whitespace collapsed and trimmed). */
export function normalizeTitle(s: string): string {
  return s.replace(/[\t\n\f\r ]+/g, ' ').trim()
}

// ---- seen stamps ------------------------------------------------------------

export interface SeenTracker {
  /** Mark a chat read up to `at` (it was on screen). True when the stamp moved. */
  markSeen(id: string, at: number): boolean
  /** Last on-screen moment, or undefined. */
  seenAt(id: string): number | undefined
  /** Unread = a completion later than the last on-screen moment (plus the skew). */
  isUnread(id: string, completedAt: number | undefined): boolean
  /** Re-read the stamps (another tab wrote them). */
  reload(): void
}

export interface SeenTrackerOptions {
  load?: () => Record<string, number> | null
  save?: (stamps: Record<string, number>) => void
  /**
   * First run (no stamps stored yet): every completion known so far counts as
   * read, so turning the feature on never floods the title with old chats.
   */
  seed?: () => Record<string, number>
  cap?: number
  skewMs?: number
}

export function createSeenTracker(opts: SeenTrackerOptions = {}): SeenTracker {
  const cap = opts.cap ?? 500
  const skew = opts.skewMs ?? SEEN_SKEW_MS
  const seen = new Map<string, number>()
  /** Stamps this tracker wrote itself (exact, no skew). */
  const mine = new Map<string, number>()
  const read = (): boolean => {
    seen.clear()
    let raw: Record<string, number> | null = null
    try { raw = opts.load?.() ?? null } catch { raw = null }
    if (raw === null || typeof raw !== 'object') return false
    for (const [id, at] of Object.entries(raw)) if (typeof at === 'number' && Number.isFinite(at)) seen.set(id, at)
    return true
  }
  const persist = (): void => {
    if (opts.save === undefined) return
    let entries = [...seen.entries()]
    if (entries.length > cap) {
      entries = entries.sort((a, b) => b[1] - a[1]).slice(0, cap)
      seen.clear()
      for (const [id, at] of entries) seen.set(id, at)
    }
    try { opts.save(Object.fromEntries(entries)) } catch { /* storage full or blocked */ }
  }
  if (!read()) {
    try {
      for (const [id, at] of Object.entries(opts.seed?.() ?? {})) if (typeof at === 'number' && Number.isFinite(at)) seen.set(id, at)
    } catch { /* nothing to seed */ }
    persist()
  }
  return {
    markSeen(id, at) {
      const prev = seen.get(id)
      if (prev !== undefined && prev >= at) return false
      seen.set(id, at)
      mine.set(id, at)
      persist()
      return true
    },
    seenAt: id => seen.get(id),
    isUnread(id, completedAt) {
      if (completedAt === undefined) return false
      const s = seen.get(id)
      if (s === undefined) return true
      return completedAt > s + (mine.get(id) === s ? 0 : skew)
    },
    reload() { read() },
  }
}

// ---- unread set (title count and the blue row markers share it) -----------

export interface UnreadEntry { id: string; completedAt: number; title: string }

/**
 * Mark the chat on screen read (while the tab is visible) and list the unread
 * chats. One definition for the tab title and the rail's row markers.
 * @param opts.entries - chats the rail lists (no subagents, bin or archive).
 * @param opts.completedAt - the Recents tracker's completion stamps.
 * @param opts.seen - the seen stamps.
 * @param opts.onScreen - the chat on screen, or null.
 * @param opts.visible - the tab is visible.
 * @returns unread chats, catalog order.
 */
export function collectUnread(opts: {
  entries: ReadonlyArray<{ id: string; blank?: boolean; title: string }>
  completedAt: (id: string) => number | undefined
  seen: Pick<SeenTracker, 'isUnread' | 'markSeen'>
  onScreen: string | null
  visible: boolean
}): UnreadEntry[] {
  if (opts.onScreen !== null && opts.visible) {
    const c = opts.completedAt(opts.onScreen)
    if (c !== undefined) opts.seen.markSeen(opts.onScreen, c)
  }
  const out: UnreadEntry[] = []
  for (const e of opts.entries) {
    if (e.blank === true || (opts.visible && e.id === opts.onScreen)) continue
    const c = opts.completedAt(e.id)
    if (c === undefined || !opts.seen.isUnread(e.id, c)) continue
    out.push({ id: e.id, completedAt: c, title: e.title })
  }
  return out
}
