// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { addDoc, createProject, deleteProject, listDocs, moveSessionToProject, projectMembers, removeDoc, renameProject } from '../src/projects.ts'
import { EMPTY_RAIL_STATE, normalizeRailState, type RailState } from '../src/store.ts'

const base = (): RailState => normalizeRailState(EMPTY_RAIL_STATE)

describe('createProject', () => {
  it('rotates hues through unused palette keys', () => {
    let s = base()
    s = { ...s, ...createProject(s, 'Alpha') }
    s = { ...s, ...createProject(s, 'Beta') }
    expect(s.projects[s.projectOrder[0]].hueKey).toBe('slate')
    expect(s.projects[s.projectOrder[1]].hueKey).toBe('teal')
  })

  it('rejects empty names', () => {
    expect(() => createProject(base(), '   ')).toThrow()
  })
})

describe('membership routing', () => {
  it('moves a chat into a project and back to the global default', () => {
    let s = base()
    s = { ...s, ...createProject(s, 'Ops') }
    const pid = s.projectOrder[0]
    s = { ...s, ...moveSessionToProject(s, 'sess1', pid) }
    expect(s.memberships['sess1']).toBe(pid)
    expect(projectMembers(s, pid)).toEqual(['sess1'])
    s = { ...s, ...moveSessionToProject(s, 'sess1', null) }
    expect(s.memberships['sess1']).toBeUndefined()
    expect(projectMembers(s, pid)).toEqual([])
  })

  it('rejects unknown projects', () => {
    expect(() => moveSessionToProject(base(), 's1', 'p_ghost')).toThrow()
  })
})

describe('deleteProject', () => {
  it('returns member chats to the global default and drops its docs', () => {
    let s = base()
    s = { ...s, ...createProject(s, 'Ops') }
    const pid = s.projectOrder[0]
    s = { ...s, ...moveSessionToProject(s, 's1', pid) }
    s = { ...s, ...addDoc(s, pid, 'document', 'spec.md', '~/docs/spec.md') }
    s = { ...s, ...deleteProject(s, pid) }
    expect(s.projectOrder).toEqual([])
    expect(s.memberships).toEqual({})
    expect(Object.keys(s.docs)).toHaveLength(0)
  })
})

describe('docs registry', () => {
  it('adds, lists sorted, removes; pointers only', () => {
    let s = base()
    s = { ...s, ...createProject(s, 'Ops') }
    const pid = s.projectOrder[0]
    s = { ...s, ...addDoc(s, pid, 'snippet', 'deploy.sh', '~/scripts/deploy.sh') }
    s = { ...s, ...addDoc(s, pid, 'document', 'runbook.md', '~/docs/runbook.md') }
    const docs = listDocs(s, pid)
    expect(docs[0].kind).toBe('document')
    expect(docs[1].kind).toBe('snippet')
    expect(docs.every(d => d.projectId === pid)).toBe(true)
    s = { ...s, ...removeDoc(s, docs[0].id) }
    expect(listDocs(s, pid)).toHaveLength(1)
  })

  it('renameProject trims and rejects empties', () => {
    let s = base()
    s = { ...s, ...createProject(s, 'Old') }
    const pid = s.projectOrder[0]
    s = { ...s, ...renameProject(s, pid, '  New  ') }
    expect(s.projects[pid].name).toBe('New')
    expect(() => renameProject(s, pid, ' ')).toThrow()
  })
})
