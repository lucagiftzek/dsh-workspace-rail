// SPDX-License-Identifier: Apache-2.0
/**
 * The 8-hue muted palette shared by project fills and pin stripes. One visual
 * language: the same hue on a project row and a chat stripe reads as
 * "belongs together". Deliberately low saturation so solid fills stay calm.
 * @module dsh-workspace-rail/palette
 */

/** Palette keys, stable ids persisted in the store (never raw colors). */
export const HUE_KEYS = ['slate', 'teal', 'amber', 'rose', 'indigo', 'lime', 'violet', 'cyan'] as const

export type HueKey = (typeof HUE_KEYS)[number]

/** Muted fill + matching stripe accent per hue key (dark-app friendly). */
export const HUES: Record<HueKey, { fill: string; stripe: string; label: string }> = {
  slate: { fill: '#2a3138', stripe: '#7d8b99', label: 'Slate' },
  teal: { fill: '#1f3a37', stripe: '#4fb3a4', label: 'Teal' },
  amber: { fill: '#3a3221', stripe: '#d3a84c', label: 'Amber' },
  rose: { fill: '#3a2629', stripe: '#d47b8b', label: 'Rose' },
  indigo: { fill: '#262a3d', stripe: '#7b8bdc', label: 'Indigo' },
  lime: { fill: '#2b3524', stripe: '#93c46a', label: 'Lime' },
  violet: { fill: '#322640', stripe: '#a98bd6', label: 'Violet' },
  cyan: { fill: '#1f3238', stripe: '#5cb6cf', label: 'Cyan' },
}

/** Defensive hue reader for PROJECT FILLS: unknown keys fall back to slate. */
export function hue(key: string | undefined): { fill: string; stripe: string } {
  const h = HUES[key as HueKey] ?? HUES.slate
  return { fill: h.fill, stripe: h.stripe }
}

const CSS_COLOR_RE = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20})$/

/**
 * Stripe color for chat rows: palette keys resolve through the palette and
 * any other CSS color (e.g. imported verbatim from dsh-session-pin's own
 * palette) passes through. Unknown falls back to slate.
 */
export function stripeColor(key: string | undefined): string {
  if (key !== undefined && (HUE_KEYS as readonly string[]).includes(key)) return HUES[key as HueKey].stripe
  if (key !== undefined && CSS_COLOR_RE.test(key)) return key
  return HUES.slate.stripe
}

/** Assign the next unused hue in rotation (deterministic per existing set). */
export function nextHue(usedKeys: readonly string[]): HueKey {
  const used = new Set(usedKeys)
  for (const k of HUE_KEYS) if (!used.has(k)) return k
  return HUE_KEYS[usedKeys.length % HUE_KEYS.length]
}