// SPDX-License-Identifier: Apache-2.0
/**
 * The rail's tab icons (a pixel rail with three rows). esbuild inlines the
 * files in `assets/` (svg as text, png as base64), so they reach the browser
 * inside this bundle: same origin, no extra request, nothing external.
 * Replace the four files and rebuild to show your own logo.
 * @module dsh-workspace-rail/tab-icons
 */
import type { TabIcon } from './tab-chrome.ts'
import svg from '../assets/rail-favicon.svg'
import png32 from '../assets/rail-icon-32.png'
import png192 from '../assets/rail-icon-192.png'
import png180 from '../assets/rail-icon-180.png'

const png = (b64: string): string => 'data:image/png;base64,' + b64

export const RAIL_ICONS: readonly TabIcon[] = [
  { rel: 'icon', type: 'image/svg+xml', href: 'data:image/svg+xml,' + encodeURIComponent(svg) },
  { rel: 'icon', type: 'image/png', sizes: '32x32', href: png(png32) },
  { rel: 'icon', type: 'image/png', sizes: '192x192', href: png(png192) },
  { rel: 'apple-touch-icon', sizes: '180x180', href: png(png180) },
]
