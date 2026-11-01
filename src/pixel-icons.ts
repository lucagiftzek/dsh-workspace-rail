// SPDX-License-Identifier: Apache-2.0
/**
 * Monochrome pixel-art folder icons: 7x7 grids rendered as inline SVG.
 * Tone (black/white) is chosen at folder creation, per spec; variants are a
 * fixed set so the store persists variant names, never markup.
 * @module dsh-workspace-rail/pixel-icons
 */

export const PIXEL_VARIANTS = ['folder', 'star', 'bolt', 'box', 'flag', 'heart'] as const
export type PixelVariant = (typeof PIXEL_VARIANTS)[number]
export type PixelTone = 'black' | 'white'

const GRIDS: Record<PixelVariant, string[]> = {
  folder: ['.......', '.XXXXX.', 'XXXXXXX', 'X.....X', 'X.....X', 'XXXXXXX', '.......'],
  star:   ['...X...', '...X...', '..XXX..', 'XXXXXXX', '.XXXXX.', '..X.X..', '.X...X.'],
  bolt:   ['....XX.', '...XX..', '..XX...', '.XXXXX.', '...XX..', '..XX...', '.XX....'],
  box:    ['.......', 'XXXXXXX', 'X..X..X', 'X..X..X', 'X..X..X', 'XXXXXXX', '.......'],
  flag:   ['XX.....', 'XXXXX..', 'XXXXXXX', 'XXXXX..', 'XX.....', 'XX.....', 'XX.....'],
  heart:  ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...', '.......'],
}

const TONE_FILL: Record<PixelTone, string> = { black: '#10141a', white: '#e6edf3' }

/** True when the name is a known pixel variant. */
export function isPixelVariant(value: string): value is PixelVariant {
  return (PIXEL_VARIANTS as readonly string[]).includes(value)
}

/** Inline SVG markup for one pixel variant + tone (crisp edges, 7x7 grid). */
export function pixelIconSvg(variant: string, tone: PixelTone): string {
  const grid = GRIDS[isPixelVariant(variant) ? variant : 'folder']
  const fill = TONE_FILL[tone === 'white' ? 'white' : 'black']
  let rects = ''
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y]
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 'X') rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 7" width="14" height="14" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`
}
