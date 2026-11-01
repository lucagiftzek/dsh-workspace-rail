import { describe, expect, it } from 'vitest'
import { relativeAge } from '../src/rail-ui.ts'

describe('relativeAge (Recents age column)', () => {
  const now = Date.UTC(2026, 8, 27, 12, 0, 0)
  it('buckets like the host list: now, m, h, d, w, y', () => {
    expect(relativeAge(now - 20_000, now)).toBe('now')
    expect(relativeAge(now - 43 * 60_000, now)).toBe('43m')
    expect(relativeAge(now - 7 * 3_600_000, now)).toBe('7h')
    expect(relativeAge(now - 3 * 86_400_000, now)).toBe('3d')
    expect(relativeAge(now - 30 * 86_400_000, now)).toBe('4w')
    expect(relativeAge(now - 800 * 86_400_000, now)).toBe('2y')
  })
  it('renders nothing for a missing or bogus timestamp', () => {
    expect(relativeAge(undefined, now)).toBe('')
    expect(relativeAge(Number.NaN, now)).toBe('')
    expect(relativeAge(0, now)).toBe('')
  })
})
