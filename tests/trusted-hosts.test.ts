// SPDX-License-Identifier: Apache-2.0
// Default trusted authorities come from the `dsh web` command line, so a
// deployment that already passes --trusted-host keeps working with no row option.
import { describe, expect, it } from 'vitest'
import { harnessTrustedHosts } from '../src/host/api.ts'

describe('harnessTrustedHosts', () => {
  it('is empty with no flag and no variable (loopback only)', () => {
    expect(harnessTrustedHosts(['node', 'dsh', 'web', '--port', '3080'], {})).toEqual([])
  })
  it('reads a single --trusted-host value', () => {
    expect(harnessTrustedHosts(['node', 'dsh', 'web', '--no-open', '--host', '127.0.0.1', '--port', '3080', '--trusted-host', 'app.example.com'], {})).toEqual(['app.example.com'])
  })
  it('reads variadic, repeated and = forms, without duplicates', () => {
    const argv = ['node', 'dsh', 'web', '--trusted-host', 'a.example.com', 'b.example.com:8443', '--port', '1', '--trusted-host=c.example.com', '--trusted-host', 'a.example.com']
    expect(harnessTrustedHosts(argv, {})).toEqual(['a.example.com', 'b.example.com:8443', 'c.example.com'])
  })
  it('adds the comma-separated environment variable', () => {
    expect(harnessTrustedHosts(['--trusted-host', 'a.example.com'], { DSH_WORKSPACE_RAIL_TRUSTED_HOSTS: ' b.example.com , ,c.example.com' })).toEqual(['a.example.com', 'b.example.com', 'c.example.com'])
  })
})
