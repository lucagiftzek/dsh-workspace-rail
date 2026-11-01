// SPDX-License-Identifier: Apache-2.0
/**
 * Section layout reducer (pure): fold (hide a section's body) and expand
 * (one section takes the whole sidebar height, the others show only their
 * header rows). The two are kept apart on purpose:
 *
 * - `collapsedSections` is the user's normal layout and is never touched by
 *   expanding, so pressing expand again restores it exactly (row heights live
 *   in `sectionRows`, which expanding never touches either).
 * - `expandedSection` is a view on top of that layout: while it is set, the
 *   expanded section is open and every other section shows as folded.
 * - A fold click always flips what the user SEES and leaves the expanded view:
 *   on the expanded section it folds that section, on a section shown folded
 *   by the expansion it opens that section.
 * @module dsh-workspace-rail/sections
 */

export type SectionKey = 'pinned' | 'projects' | 'recents'

export const SECTION_KEYS: readonly SectionKey[] = ['pinned', 'projects', 'recents']

export interface SectionLayout {
  collapsedSections: string[]
  expandedSection: SectionKey | null
}

export interface SectionView {
  /** The body is hidden (folded by the user, or by another section's expansion). */
  folded: boolean
  /** This section fills the sidebar. */
  expanded: boolean
}

export function isSectionKey(v: unknown): v is SectionKey {
  return v === 'pinned' || v === 'projects' || v === 'recents'
}

/** What a section shows under the current layout. */
export function sectionView(layout: SectionLayout, key: SectionKey): SectionView {
  if (layout.expandedSection !== null) {
    const expanded = layout.expandedSection === key
    return { folded: !expanded, expanded }
  }
  return { folded: layout.collapsedSections.includes(key), expanded: false }
}

/** Expand `key` (only one at a time), or restore the normal layout when it is the expanded one. */
export function toggleExpanded(layout: SectionLayout, key: SectionKey): SectionLayout {
  return {
    collapsedSections: [...layout.collapsedSections],
    expandedSection: layout.expandedSection === key ? null : key,
  }
}

/** Flip what the section shows (see the module note). */
export function toggleFold(layout: SectionLayout, key: SectionKey): SectionLayout {
  const view = sectionView(layout, key)
  const without = layout.collapsedSections.filter(k => k !== key)
  const collapsedSections = view.folded ? without : [...without, key]
  return { collapsedSections, expandedSection: null }
}
