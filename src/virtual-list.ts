// SPDX-License-Identifier: Apache-2.0
/**
 * Framework-free windowed list: fixed row height, top/bottom spacers, rAF-
 * throttled scroll. Pure window math is exported separately for tests,

 * ~1,700 rows cost the same as 100.
 * @module dsh-workspace-rail/virtual-list
 */

export interface WindowInput {
  scrollTop: number
  viewportHeight: number
  rowHeight: number
  overscan?: number
  total: number
}

export interface WindowResult {
  start: number
  /** Exclusive end index. */
  end: number
  padTop: number
  padBottom: number
}

/** Clamp a window of rows to render for the current scroll position. */
export function computeWindow(input: WindowInput): WindowResult {
  const { scrollTop, viewportHeight, rowHeight, total } = input
  const overscan = Math.max(0, input.overscan ?? 4)
  if (total <= 0 || rowHeight <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 }
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight)
  const visible = Math.ceil(Math.max(0, viewportHeight) / rowHeight) + 1
  const start = Math.max(0, first - overscan)
  const end = Math.min(total, first + visible + overscan)
  return { start, end, padTop: start * rowHeight, padBottom: Math.max(0, (total - end) * rowHeight) }
}

export interface VirtualListOptions {
  rowHeight: number
  overscan?: number
  /** Total row count (re-read on every refresh via count()). */
  count(): number
  /** Render one row; returning null renders an empty row. */
  renderRow(index: number): HTMLElement | null
  /** Class for the viewport element. */
  className?: string
  /** Stable key so a host redraw can restore this list's scroll position. */
  keepKey?: string
}

const raf = (cb: () => void): void => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(cb)
  else setTimeout(cb, 16)
}

/**
 * Fixed-height windowed list bound to a scrollable host element.
 *
 * Layout (2026-09-29 rewrite): the scroll height is set ONCE by a sizer of
 * `total * rowHeight` and never changes while scrolling; the rendered band is
 * absolutely positioned inside it. The old design resized top/bottom spacers on
 * every frame, which fed browser scroll anchoring and made the list run away
 * to the bottom under trackpad momentum. Scroll anchoring is also disabled.
 * The band is only rebuilt when the visible index range actually changes.
 */
export class VirtualList {
  readonly viewport: HTMLElement
  private readonly sizer: HTMLElement
  private readonly band: HTMLElement
  private readonly opts: VirtualListOptions
  private scheduled = false
  private lastScrollAt = 0
  private lastRange: WindowResult = { start: -1, end: -1, padTop: 0, padBottom: 0 }

  constructor(host: HTMLElement, opts: VirtualListOptions) {
    this.opts = opts
    this.viewport = document.createElement('div')
    if (opts.className !== undefined) this.viewport.className = opts.className
    if (opts.keepKey !== undefined) this.viewport.dataset.keep = opts.keepKey
    this.viewport.style.position = 'relative'
    this.viewport.style.setProperty('overflow-anchor', 'none')
    this.sizer = document.createElement('div')
    this.sizer.style.position = 'relative'
    this.sizer.style.width = '100%'
    this.sizer.style.setProperty('overflow-anchor', 'none')
    this.band = document.createElement('div')
    this.band.style.position = 'absolute'
    this.band.style.left = '0'
    this.band.style.right = '0'
    this.band.style.top = '0'
    this.band.style.setProperty('overflow-anchor', 'none')
    this.sizer.appendChild(this.band)
    this.viewport.appendChild(this.sizer)
    host.appendChild(this.viewport)
    this.viewport.addEventListener('scroll', this.onScroll, { passive: true })
    this.refresh()
  }

  private onScroll = (): void => {
    this.lastScrollAt = Date.now()
    if (this.scheduled) return
    this.scheduled = true
    raf(() => { this.scheduled = false; this.refresh(false) })
  }

  /** True while the user is actively scrolling (a host redraw should wait). */
  get scrolling(): boolean { return Date.now() - this.lastScrollAt < 250 }

  /** Re-render the current window (force=true also after count/content changes). */
  refresh(force = true): WindowResult {
    const total = this.opts.count()
    const range = computeWindow({
      scrollTop: this.viewport.scrollTop,
      viewportHeight: this.viewport.clientHeight,
      rowHeight: this.opts.rowHeight,
      overscan: this.opts.overscan,
      total,
    })
    const totalPx = String(total * this.opts.rowHeight) + 'px'
    if (this.sizer.style.height !== totalPx) this.sizer.style.height = totalPx
    if (!force && range.start === this.lastRange.start && range.end === this.lastRange.end) return range
    this.lastRange = range
    this.band.style.transform = 'translateY(' + String(range.padTop) + 'px)'
    const rows: HTMLElement[] = []
    for (let i = range.start; i < range.end; i++) {
      const row = this.opts.renderRow(i)
      if (row !== null) rows.push(row)
    }
    this.band.replaceChildren(...rows)
    return range
  }

  /** The last computed window (for assertions and diagnostics). */
  get range(): WindowResult { return this.lastRange }

  destroy(): void {
    this.viewport.removeEventListener('scroll', this.onScroll)
    this.viewport.remove()
  }
}
