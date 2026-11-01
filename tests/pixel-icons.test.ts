// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { PIXEL_VARIANTS, pixelIconSvg } from '../src/pixel-icons.ts'

describe('pixelIconSvg', () => {
  it('renders every variant with pixel rects', () => {
    for (const v of PIXEL_VARIANTS) {
      const svg = pixelIconSvg(v, 'black')
      expect(svg.startsWith('<svg')).toBe(true)
      expect(svg).toContain('<rect')
    }
  })

  it('honors the tone (black vs white fill)', () => {
    expect(pixelIconSvg('folder', 'white')).toContain('#e6edf3')
    expect(pixelIconSvg('folder', 'black')).toContain('#10141a')
  })

  it('falls back to the folder variant on unknown names', () => {
    expect(pixelIconSvg('nope', 'black')).toBe(pixelIconSvg('folder', 'black'))
  })
})
