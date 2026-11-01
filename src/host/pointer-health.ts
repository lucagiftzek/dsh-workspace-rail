// SPDX-License-Identifier: Apache-2.0
/**
 * Pointer health (host side, injectable fs): project doc pointers are checked
 * against the real filesystem. Tilde-expansion that rescues a missing path is
 * reported as a rebind candidate; truly missing pointers are removal
 * candidates in the carryover dry-run. Pure given the fs face.
 * @module dsh-workspace-rail/host/pointer-health
 */
import { homedir } from 'node:os'
import { statSync } from 'node:fs'

export interface PointerDoc { id: string; pointer: string }

export interface PointerHealth {
  status: 'ok' | 'missing'
  /** Tilde-expanded absolute path when different from the stored pointer. */
  repaired?: string
}

export interface FsStatFace {
  stat(path: string): { isFile(): boolean }
}

export const nodeFsStat: FsStatFace = {
  stat(path: string): { isFile(): boolean } {
    return statSync(path)
  },
}

/** Expand a leading ~ to the home directory (no other magic). */
export function expandPointer(pointer: string): string {
  if (pointer === '~' || pointer.startsWith('~/')) return homedir() + pointer.slice(1)
  return pointer
}

/**
 * Check one batch of docs. URLs and empty pointers count as ok (non-fs
 * pointers cannot be verified here and are never removal candidates).
 */
export function checkPointers(docs: readonly PointerDoc[], fs: FsStatFace = nodeFsStat): Record<string, PointerHealth> {
  const health: Record<string, PointerHealth> = {}
  for (const doc of docs) {
    const pointer = doc.pointer.trim()
    if (pointer.length === 0 || /^[a-z]+:\/\//i.test(pointer)) {
      health[doc.id] = { status: 'ok' }
      continue
    }
    const expanded = expandPointer(pointer)
    try {
      fs.stat(expanded)
      health[doc.id] = expanded !== pointer ? { status: 'ok', repaired: expanded } : { status: 'ok' }
    } catch {
      health[doc.id] = { status: 'missing' }
    }
  }
  return health
}
