// SPDX-License-Identifier: Apache-2.0
/**
 * The browser tab's own chrome: favicon links and `document.title`.
 *
 * - Icons: the shell's `<link rel=icon>` entries (the DSH whale) are taken out
 *   of `<head>` and kept; the rail's own links (rail icon, SVG plus PNG
 *   sizes and an apple-touch-icon) go in. The icons are data: URLs built into
 *   the client bundle, so the browser fetches nothing for them (favicon loads
 *   bypass the service worker, so a served file would travel unsealed).
 * - Title: the core rewrites `document.title` on every navigation, so a
 *   MutationObserver on `<head>` re-applies the wanted title whenever the text
 *   differs. Idempotent: nothing is written when the title already matches.
 * stop() restores the shell's links and the last title the core set.
 * @module dsh-workspace-rail/tab-chrome
 */
import { normalizeTitle } from './tab-title.ts'

export interface TabIcon {
  rel: 'icon' | 'apple-touch-icon'
  href: string
  type?: string
  sizes?: string
}

export interface TabChrome {
  /** Show this title (no-op when it is already showing). */
  setTitle(title: string): void
  /** The title the core (or anyone else) last set, ours excluded. */
  foreignTitle(): string
  stop(): void
}

const OWN_ATTR = 'data-workspace-rail-icon'
const isIconLink = (n: Node): n is HTMLLinkElement =>
  n.nodeType === 1 && (n as Element).tagName === 'LINK' && /(^|\s)(icon|apple-touch-icon|apple-touch-icon-precomposed)(\s|$)/i.test((n as HTMLLinkElement).rel ?? '')

/**
 * Take over the tab icon and title.
 * @param doc - the page document.
 * @param icons - links to install (data: URLs).
 * @returns the controller.
 */
export function createTabChrome(doc: Document, icons: readonly TabIcon[]): TabChrome {
  const head = doc.head ?? doc.documentElement
  const parked: Array<{ el: HTMLLinkElement; next: Node | null }> = []
  const own: HTMLLinkElement[] = []
  let wanted: string | null = null
  let foreign = doc.title
  let stopped = false

  const park = (el: HTMLLinkElement): void => {
    if (el.hasAttribute(OWN_ATTR)) return
    parked.push({ el, next: el.nextSibling })
    el.remove()
  }
  for (const el of [...head.querySelectorAll('link')]) if (isIconLink(el)) park(el)
  for (const icon of icons) {
    const el = doc.createElement('link')
    el.setAttribute(OWN_ATTR, '')
    el.rel = icon.rel
    if (icon.type !== undefined) el.type = icon.type
    if (icon.sizes !== undefined) el.setAttribute('sizes', icon.sizes)
    el.href = icon.href
    head.appendChild(el)
    own.push(el)
  }

  const applyTitle = (): void => {
    if (wanted === null) return
    const current = doc.title
    if (current === wanted) return
    if (current.length > 0) foreign = current
    doc.title = wanted
  }

  const Observer = (doc.defaultView as (Window & typeof globalThis) | null)?.MutationObserver ?? globalThis.MutationObserver
  const observer = Observer === undefined ? null : new Observer(records => {
    if (stopped) return
    for (const r of records) for (const n of r.addedNodes) if (isIconLink(n)) park(n)
    applyTitle()
  })
  // The whole <head>: the core may replace the <title> element, not just its text.
  observer?.observe(head, { childList: true, subtree: true, characterData: true })

  return {
    setTitle(title) {
      if (stopped) return
      wanted = normalizeTitle(title)
      applyTitle()
    },
    foreignTitle: () => foreign,
    stop() {
      if (stopped) return
      stopped = true
      observer?.disconnect()
      for (const el of own) el.remove()
      own.length = 0
      for (const { el, next } of parked.reverse()) {
        if (next !== null && next.parentNode === head) head.insertBefore(el, next)
        else head.appendChild(el)
      }
      parked.length = 0
      if (wanted !== null && doc.title === wanted) doc.title = foreign
      wanted = null
    },
  }
}
