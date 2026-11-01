// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { PINNED_BOOST, TIER_WEIGHTS, matchTier, rankResults, recencyDecay, scoreDoc, type SearchDoc } from '../src/scoring.ts'

const NOW = 1_800_000_000_000
const doc = (over: Partial<SearchDoc> = {}): SearchDoc => ({
  id: 's1', title: 'Refactor the DB layer', folderNames: [], docNames: [], tags: [],
  firstMsgs: [], lastMsgs: [], lastUsed: NOW, pinned: false, ...over,
})

describe('matchTier', () => {
  it('rank 1: titles, folder names, project titles', () => {
    expect(matchTier(doc(), 'db layer')).toBe(1)
    expect(matchTier(doc({ folderNames: ['Archive 2026'] }), 'archive')).toBe(1)
    expect(matchTier(doc({ projectTitle: 'Acme Ops' }), 'acme')).toBe(1)
  })

  it('rank 2: document names and tags', () => {
    expect(matchTier(doc({ docNames: ['api-spec.md'] }), 'api-spec')).toBe(2)
    expect(matchTier(doc({ tags: ['infra'] }), 'INFRA')).toBe(2)
  })

  it('rank 3 and 4: first and last transcript windows', () => {
    expect(matchTier(doc({ firstMsgs: ['research the grant balance'] }), 'grant balance')).toBe(3)
    expect(matchTier(doc({ lastMsgs: ['summary: shipped P0'] }), 'shipped p0')).toBe(4)
  })

  it('returns null on no match and empty query', () => {
    expect(matchTier(doc(), 'nonexistent-token')).toBeNull()
    expect(matchTier(doc(), '   ')).toBeNull()
  })

  it('tier precedence: a title hit outranks a transcript hit', () => {
    const d = doc({ title: 'Deploy runbook', lastMsgs: ['deploy runbook again'] })
    expect(matchTier(d, 'deploy runbook')).toBe(1)
  })
})

describe('recencyDecay', () => {
  it('is 1 at t=0 and 0.5 at one half-life', () => {
    expect(recencyDecay(NOW, NOW)).toBe(1)
    expect(recencyDecay(NOW - 14 * 86_400_000, NOW)).toBeCloseTo(0.5, 5)
  })

  it('is 1 when the timestamp is in the future or malformed', () => {
    expect(recencyDecay(NOW + 5000, NOW)).toBe(1)
    expect(recencyDecay(Number.NaN, NOW)).toBe(1)
  })
})

describe('scoreDoc / rankResults', () => {
  it('applies tier weights, decay, and the pinned boost', () => {
    const hit = scoreDoc(doc({ pinned: true, lastUsed: NOW - 14 * 86_400_000 }), 'db layer', NOW)
    expect(hit).not.toBeNull()
    expect(hit?.tier).toBe(1)
    expect(hit?.score).toBeCloseTo(TIER_WEIGHTS.title * 0.5 * PINNED_BOOST, 5)
  })

  it('a fresh rank-4 hit outranks a stale rank-1 hit', () => {
    const fresh = doc({ id: 'fresh', lastMsgs: ['carryover diff applied'], lastUsed: NOW })
    const stale = doc({ id: 'stale', title: 'carryover diff applied', lastUsed: NOW - 90 * 86_400_000 })
    const ranked = rankResults([stale, fresh], 'carryover diff applied', NOW)
    expect(ranked[0].id).toBe('fresh')
  })

  it('ties break by lastUsed desc and unmatched docs never appear', () => {
    const a = doc({ id: 'a', title: 'Ditto', lastUsed: NOW - 1000 })
    const b = doc({ id: 'b', title: 'Ditto', lastUsed: NOW })
    const noise = doc({ id: 'n', title: 'Unrelated' })
    const ranked = rankResults([a, b, noise], 'ditto', NOW)
    expect(ranked.map(r => r.id)).toEqual(['b', 'a'])
  })
})
