// Free, local matching: each new feed item is fingerprinted the same way as registered work and
// aligned with it sentence by sentence. Only items that clear a threshold reach the paid judge.
import { containment, cosine, embed, segments, shingles } from '../core/fingerprint.js'
import type { Work } from '../core/works.js'
import type { Item } from './sources.js'

/** A work's sentence counts as matched when some sentence in the candidate is at least this close. */
export const SENTENCE_MATCH = Number(process.env.SENTENCE_MATCH ?? 0.8)
/** Flag a candidate when this share of the work's sentences are matched… */
export const COVERAGE_THRESHOLD = Number(process.env.COVERAGE_THRESHOLD ?? 0.3)
/** …or when this share of the work's 8-word phrases appear in it word for word. */
export const VERBATIM_THRESHOLD = Number(process.env.VERBATIM_THRESHOLD ?? 0.15)
const MIN_WORDS = 40

export interface SentencePair {
  original: string
  found: string
  similarity: number
}

export interface Hit {
  work: Work
  item: Item
  coverage: number
  verbatim: number
  pairs: SentencePair[]
}

const round = (n: number) => Math.round(n * 1000) / 1000
const handle = (name: string | null) => name?.toLowerCase().replace(/^\/?u\/|^@/, '').trim() || null

export async function findHits(item: Item, works: Work[]): Promise<Hit[]> {
  if (!works.length || item.text.split(/\s+/).length < MIN_WORDS) return []
  const found = segments(item.text)
  const vectors = await embed(found)
  const foundShingles = shingles(item.text)
  const hits: Hit[] = []
  for (const work of works) {
    // The creator's own post is not a copy.
    if (handle(work.author) && handle(work.author) === handle(item.author)) continue
    const pairs = work.segments.map((segment) => {
      let best = -1
      let bestIndex = 0
      vectors.forEach((vector, i) => {
        const similarity = cosine(segment.embedding, vector)
        if (similarity > best) [best, bestIndex] = [similarity, i]
      })
      return { original: segment.text, found: found[bestIndex] ?? '', similarity: round(best) }
    })
    const coverage = round(pairs.filter((pair) => pair.similarity >= SENTENCE_MATCH).length / pairs.length)
    const verbatim = round(containment(shingles(work.text), foundShingles))
    if (coverage >= COVERAGE_THRESHOLD || verbatim >= VERBATIM_THRESHOLD) {
      hits.push({ work, item, coverage, verbatim, pairs: pairs.sort((a, b) => b.similarity - a.similarity).slice(0, 6) })
    }
  }
  return hits
}
