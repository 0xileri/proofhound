// Fingerprints are computed locally and cost nothing: a SHA-256 of the exact text (what goes
// on-chain), MiniLM embeddings of each sentence (catches rewording) and 8-word shingles (catches
// word-for-word copying). Credits are only spent later, judging the few matches that look real.
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { env, pipeline } from '@huggingface/transformers'
import { DATA_DIR } from './store.js'

export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2'
// Keep the downloaded model with the data, so a redeploy doesn't fetch it again.
env.cacheDir = join(DATA_DIR, 'models')
const MIN_SEGMENT_WORDS = 6 // shorter sentences are too generic alone, so they join their neighbour
const MAX_SEGMENTS = 400 // bounds the work on very long feed items
const SHINGLE_WORDS = 8

export type Hex = `0x${string}`

/** The exact text that gets hashed: line endings unified, outer whitespace trimmed, nothing else. */
export function canonical(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim()
}

export function sha256(data: string | Uint8Array): Hex {
  return `0x${createHash('sha256').update(data).digest('hex')}`
}

/**
 * Sentences, with very short ones joined to the next, so a copy is matched line by line however
 * differently the two texts are laid out.
 */
export function segments(text: string): string[] {
  const sentences = canonical(text)
    .split(/\n\s*\n/)
    .flatMap((paragraph) => {
      // Verse has no sentence ends to cut at, so its lines are the units; prose is reflowed first.
      const lines = paragraph.split('\n').map((line) => line.trim()).filter(Boolean)
      const verse = lines.length >= 3 && lines.filter((line) => line.split(/\s+/).length <= 12).length >= lines.length * 0.8
      return verse ? lines : [lines.join(' ')]
    })
    .flatMap((unit) => unit.replace(/\s+/g, ' ').match(/[^.!?]+(?:[.!?]+["'”’)\]]*|$)/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean)
  const result: string[] = []
  let pending = ''
  for (const sentence of sentences) {
    pending = pending ? `${pending} ${sentence}` : sentence
    if (pending.split(' ').length >= MIN_SEGMENT_WORDS) {
      result.push(pending)
      pending = ''
    }
  }
  if (pending) result.push(result.length ? `${result.pop()} ${pending}` : pending)
  return result.slice(0, MAX_SEGMENTS)
}

const loadExtractor = () => pipeline('feature-extraction', EMBEDDING_MODEL, { dtype: 'q8' })
let extractor: ReturnType<typeof loadExtractor> | undefined

/** Unit-length embeddings, one per text. The model runs here and downloads once (~23 MB). */
export async function embed(texts: string[]): Promise<number[][]> {
  if (!texts.length) return []
  extractor ??= loadExtractor()
  const output = await (await extractor)(texts, { pooling: 'mean', normalize: true })
  return (output.tolist() as number[][]).map((vector) => vector.map((x) => Math.round(x * 1e5) / 1e5))
}

/** Vectors are unit length, so the dot product is the cosine similarity. */
export function cosine(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!
  return sum
}

/** Commits to the stored fingerprint, so it provably wasn't changed after registration. */
export function embeddingSha256(vectors: number[][]): Hex {
  return sha256(new Uint8Array(Float32Array.from(vectors.flat()).buffer))
}

function words(text: string): string[] {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

export function wordCount(text: string): number {
  return words(text).length
}

/** Every run of 8 words. Shared shingles mean shared wording, not just a shared topic. */
export function shingles(text: string): Set<string> {
  const all = words(text)
  if (all.length < SHINGLE_WORDS) return new Set(all.length ? [all.join(' ')] : [])
  const result = new Set<string>()
  for (let i = 0; i + SHINGLE_WORDS <= all.length; i++) result.add(all.slice(i, i + SHINGLE_WORDS).join(' '))
  return result
}

/** Share of the original's wording that appears word for word in the candidate. */
export function containment(original: Set<string>, candidate: Set<string>): number {
  if (!original.size) return 0
  let shared = 0
  for (const shingle of original) if (candidate.has(shingle)) shared++
  return shared / original.size
}
