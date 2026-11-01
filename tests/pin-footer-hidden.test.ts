// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { PIN_FOOTER, RAIL_CSS } from '../src/rail-style.ts'

describe('pinned-sessions footer button', () => {
  it('is hidden by the rail stylesheet (the rail lists pinned sessions)', () => {
    expect(PIN_FOOTER).toBe('button.__dsh-session-pin-footer__')
    expect(RAIL_CSS).toContain('button.__dsh-session-pin-footer__{display:none!important;}')
  })
})
