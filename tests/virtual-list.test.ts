// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { computeWindow } from '../src/virtual-list.ts'

describe('computeWindow', () => {
  it('renders roughly the viewport plus overscan, nothing more', () => {
    const w = computeWindow({ scrollTop: 0, viewportHeight: 320, rowHeight: 32, overscan: 4, total: 1729 })
    expect(w.start).toBe(0)
    expect(w.end).toBeLessThanOrEqual(320 / 32 + 1 + 4 + 1)
    expect(w.padTop).toBe(0)
  })

  it('advances the window with scroll and pads both sides', () => {
    const w = computeWindow({ scrollTop: 3200, viewportHeight: 320, rowHeight: 32, overscan: 4, total: 1729 })
    expect(w.start).toBeGreaterThanOrEqual(100 - 4 - 1)
    expect(w.padTop).toBe(w.start * 32)
    expect(w.padTop + (w.end - w.start) * 32 + w.padBottom).toBe(1729 * 32)
  })

  it('clamps at the tail of the list', () => {
    const w = computeWindow({ scrollTop: 999_999, viewportHeight: 320, rowHeight: 32, overscan: 4, total: 100 })
    expect(w.end).toBe(100)
    expect(w.padBottom).toBe(0)
  })

  it('handles empty lists and degenerate inputs', () => {
    expect(computeWindow({ scrollTop: 0, viewportHeight: 320, rowHeight: 32, total: 0 })).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0 })
    expect(computeWindow({ scrollTop: 0, viewportHeight: 320, rowHeight: 0, total: 10 })).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0 })
  })
})
