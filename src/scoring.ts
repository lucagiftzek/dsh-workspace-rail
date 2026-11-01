// SPDX-License-Identifier: Apache-2.0
/**
 * Graded search scoring (pure, P0 core; MiniSearch wiring lands in P3).
 * Tiered relevance as designed:
 *   Rank 1: titles, folder names, project titles   ×40
 *   Rank 2: project document names + meta-tags     ×15
 *   Rank 3: first 2-3 transcript messages           ×8
 *   Rank 4: last 2-3 transcript messages            ×4
 * plus recency decay (half-life 14 days) and a ×1.2 pinned/projected boost.
 * Ties break by lastUsed desc. P0 matching is case-insensitive substring;
 * the tier model is what persists.
 * @module dsh-workspace-rail/scoring
 */

export const TIER_WEIGHTS = { title: 40, docs: 15, first: 8, last: 4 } as const
export const RECENCY_HALF_LIFE_DAYS = 14
export const PINNED_BOOST = 1.2

export type Tier = 1 | 2 | 3 | 4

export interface SearchDoc {
  id: string
  title: string
  folderNames: readonly string[]
  projectTitle?: string
  docNames: readonly string[]
  tags: readonly string[]
  firstMsgs: readonly string[]
  lastMsgs: readonly string[]
  /** Epoch ms of last use. */
  lastUsed: number
  pinned: boolean
}

export interface ScoredHit {
  id: string
  score: number
  tier: Tier
}

const includes = (haystacks: readonly string[], needle: string): boolean =>
  haystacks.some(h => typeof h === 'string' && h.toLowerCase().includes(needle))

/** First (highest) tier that matches the query, or null. */
export function matchTier(doc: SearchDoc, query: string): Tier | null {
  const q = query.trim().toLowerCase()
  if (q.length === 0) return null
  if (includes([doc.title, ...doc.folderNames, ...(doc.projectTitle !== undefined ? [doc.projectTitle] : [])], q)) return 1
  if (includes([...doc.docNames, ...doc.tags], q)) return 2
  if (includes(doc.firstMsgs, q)) return 3
  if (includes(doc.lastMsgs, q)) return 4
  return null
}

/** Exponential recency decay with the configured half-life (1.0 at t=0). */
export function recencyDecay(lastUsed: number, now: number, halfLifeDays = RECENCY_HALF_LIFE_DAYS): number {
  if (!Number.isFinite(lastUsed) || !Number.isFinite(now) || now <= lastUsed) return 1
  const ageDays = (now - lastUsed) / 86_400_000
  return Math.pow(0.5, ageDays / halfLifeDays)
}

/** Score one document: 0 when unmatched; weight × decay × boost otherwise. */
export function scoreDoc(doc: SearchDoc, query: string, now: number): ScoredHit | null {
  const tier = matchTier(doc, query)
  if (tier === null) return null
  const weight = tier === 1 ? TIER_WEIGHTS.title : tier === 2 ? TIER_WEIGHTS.docs : tier === 3 ? TIER_WEIGHTS.first : TIER_WEIGHTS.last
  const score = weight * recencyDecay(doc.lastUsed, now) * (doc.pinned ? PINNED_BOOST : 1)
  return { id: doc.id, score, tier }
}

/** Rank all docs for a query: score desc, ties by lastUsed desc. */
export function rankResults(docs: readonly SearchDoc[], query: string, now: number): ScoredHit[] {
  const hits: Array<ScoredHit & { lastUsed: number }> = []
  for (const d of docs) {
    const hit = scoreDoc(d, query, now)
    if (hit !== null) hits.push({ ...hit, lastUsed: d.lastUsed })
  }
  hits.sort((a, b) => (b.score !== a.score ? b.score - a.score : b.lastUsed - a.lastUsed))
  return hits.map(({ id, score, tier }) => ({ id, score, tier }))
}
