// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { applyCarryover, duplicateDocIds, planCarryover, planProjectCleanup, revertCarryover } from '../src/carryover.ts'
import { EMPTY_RAIL_STATE, normalizeRailState, type RailState } from '../src/store.ts'

const state = (): RailState => {
  let s = normalizeRailState(EMPTY_RAIL_STATE)
  s.projects['p1'] = { id: 'p1', name: 'Ops', hueKey: 'teal', workspaceId: null, autoCarryover: false }
  s.projects['p2'] = { id: 'p2', name: 'Web', hueKey: 'amber', workspaceId: null, autoCarryover: false }
  s.projectOrder = ['p1', 'p2']
  s.docs['d1'] = { id: 'd1', projectId: 'p1', kind: 'document', name: 'spec.md', pointer: '~/docs/spec.md' }
  s.docs['d2'] = { id: 'd2', projectId: 'p1', kind: 'snippet', name: 'deploy.sh', pointer: '~/scripts/deploy.sh' }
  s.docs['d3'] = { id: 'd3', projectId: 'p1', kind: 'document', name: 'old.md', pointer: '/gone/path.md' }
  s.docs['d4'] = { id: 'd4', projectId: 'p1', kind: 'document', name: 'spec copy.md', pointer: '~/docs/spec.md' }
  s.memberships['sess1'] = 'p1'
  return s
}

const health = {
  d1: { status: 'ok' as const, repaired: '/home/alice/docs/spec.md' },
  d2: { status: 'ok' as const },
  d3: { status: 'missing' as const },
  d4: { status: 'ok' as const },
}

describe('planCarryover', () => {
  it('adds healthy target docs, rebinds rescued pointers, trims missing + duplicates', () => {
    const plan = planCarryover(state(), 'sess1', 'p2', health)
    expect(plan.fromProjectId).toBe('p1')
    expect(plan.toProjectId).toBe('p2')
    expect(plan.adds).toEqual([]) // target p2 has no docs yet
    // rebind + trim are computed from the SOURCE project on leave... they
    // belong to the source scan; d1's repaired pointer rebinds on carry.
  })

  it('moving OUT to global lists missing source docs as removals', () => {
    const plan = planCarryover(state(), 'sess1', null, health)
    expect(plan.toProjectId).toBeNull()
    expect(plan.removes.map(r => r.docId)).toContain('d3')
    expect(plan.removes.find(r => r.docId === 'd3')?.reason).toContain('missing')
  })

  it('flags duplicate pointers inside the target project', () => {
    const plan = planCarryover(state(), 'sess1', 'p1', health)
    const dupe = plan.removes.find(r => r.docId === 'd4')
    expect(dupe).toBeDefined()
    expect(dupe?.reason).toContain('duplicate')
    const rebind = plan.rebinds.find(r => r.docId === 'd1')
    expect(rebind?.to).toBe('/home/alice/docs/spec.md')
  })

  it('rejects unknown projects', () => {
    expect(() => planCarryover(state(), 'sess1', 'p_ghost')).toThrow()
  })
})

describe('applyCarryover + revertCarryover', () => {
  it('applies membership, rebinds, removals; journals an inverse', () => {
    let s = state()
    const plan = planCarryover(s, 'sess1', 'p1', health)
    s = { ...s, ...applyCarryover(s, plan) }
    expect(s.journal).toHaveLength(1)
    expect(s.docs['d1'].pointer).toBe('/home/alice/docs/spec.md')
    expect(s.docs['d4']).toBeUndefined()
    // revert restores everything
    const back = revertCarryover(s)
    expect(back).not.toBeNull()
    const s2 = { ...s, ...back! }
    expect(s2.docs['d1'].pointer).toBe('~/docs/spec.md')
    expect(s2.docs['d4']).toBeDefined()
    expect(s2.journal).toHaveLength(0)
   })

  it('membership revert returns the chat to its previous workspace', () => {
    let s = state()
    const plan = planCarryover(s, 'sess1', 'p2', health)
    s = { ...s, ...applyCarryover(s, plan) }
    expect(s.memberships['sess1']).toBe('p2')
    const s2 = { ...s, ...revertCarryover(s)! }
    expect(s2.memberships['sess1']).toBe('p1')
  })

  it('revert on empty journal returns null', () => {
    expect(revertCarryover(state())).toBeNull()
  })

  it('journal is capped at 50 entries', () => {
    let s = state()
    for (let i = 0; i < 60; i++) {
      const plan = planCarryover(s, 'sess1', 'p2', {})
      s = { ...s, ...applyCarryover(s, plan) }
      // alternate back to keep moving
      const plan2 = planCarryover(s, 'sess1', 'p1', {})
      s = { ...s, ...applyCarryover(s, plan2) }
    }
    expect(s.journal.length).toBeLessThanOrEqual(50)
  })
})

describe('planProjectCleanup', () => {
  it('rebinds and trims without touching membership', () => {
    const s = state()
    const plan = planProjectCleanup(s, 'p1', health)
    expect(plan.sessionId).toBe('')
    expect(plan.rebinds.map(r => r.docId)).toContain('d1')
    expect(plan.removes.map(r => r.docId)).toEqual(expect.arrayContaining(['d3', 'd4']))
    const s2 = { ...s, ...applyCarryover(s, plan) }
    expect(s2.memberships['sess1']).toBe('p1') // unchanged
    expect(s2.docs['d3']).toBeUndefined()
  })
})

describe('duplicateDocIds', () => {
  it('finds duplicate pointers within a project', () => {
    expect(duplicateDocIds(state(), 'p1')).toEqual(['d4'])
    expect(duplicateDocIds(state(), 'p2')).toEqual([])
  })
})