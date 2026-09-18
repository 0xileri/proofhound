// The registry: a work is fingerprinted locally, stored, then its hashes are attested on Base by
// the agent's wallet. If the attestation fails (say, no gas yet) the work waits and is retried.
import { randomBytes } from 'node:crypto'
import type { Address } from 'viem'
import { attestWork, type Attestation } from '../chain/eas.js'
import { canonical, embed, embeddingSha256, segments, sha256, wordCount, type Hex } from './fingerprint.js'
import { logEvent } from './ledger.js'
import { readJson, writeJson } from './store.js'

export interface Segment {
  text: string
  embedding: number[]
}

export interface Work {
  id: string
  title: string
  author: string | null
  wallet: Address | null
  text: string
  contentSha256: Hex
  embeddingSha256: Hex
  segments: Segment[]
  registeredAt: string
  attestation: Attestation | null
  attestationError: string | null
}

export class RegistrationError extends Error {}

const WORKS_FILE = 'works.json'
const MIN_WORDS = 40
const MAX_CHARS = 20_000

export const works = new Map(readJson<Work[]>(WORKS_FILE, []).map((work) => [work.id, work]))

function saveWorks(): void {
  writeJson(WORKS_FILE, [...works.values()])
}

export async function registerWork(input: {
  title: string
  text: string
  author?: string
  wallet?: string
}): Promise<Work> {
  const text = canonical(input.text)
  const title = input.title.trim().slice(0, 120)
  const wallet = input.wallet?.trim() || null
  if (!title) throw new RegistrationError('Give the work a title.')
  if (text.length > MAX_CHARS) throw new RegistrationError(`Keep it under ${MAX_CHARS.toLocaleString('en')} characters.`)
  if (wordCount(text) < MIN_WORDS) throw new RegistrationError(`Paste at least ${MIN_WORDS} words so copies can be recognised.`)
  if (wallet && !/^0x[0-9a-fA-F]{40}$/.test(wallet)) throw new RegistrationError('That wallet address does not look right.')

  const contentSha256 = sha256(text)
  const existing = [...works.values()].find((work) => work.contentSha256 === contentSha256)
  if (existing) return existing

  const sentences = segments(text)
  const vectors = await embed(sentences)
  const work: Work = {
    id: randomBytes(5).toString('hex'),
    title,
    author: input.author?.trim().slice(0, 60) || null,
    wallet: wallet as Address | null,
    text,
    contentSha256,
    embeddingSha256: embeddingSha256(vectors),
    segments: sentences.map((sentence, i) => ({ text: sentence, embedding: vectors[i]! })),
    registeredAt: new Date().toISOString(),
    attestation: null,
    attestationError: null,
  }
  works.set(work.id, work)
  saveWorks()
  logEvent('register', { workId: work.id, contentSha256 })
  await attest(work)
  return work
}

async function attest(work: Work): Promise<void> {
  try {
    work.attestation = await attestWork({
      contentSha256: work.contentSha256,
      embeddingSha256: work.embeddingSha256,
      workId: work.id,
      recipient: work.wallet ?? undefined,
    })
    work.attestationError = null
    logEvent('attest', { workId: work.id, uid: work.attestation.uid, txHash: work.attestation.txHash })
  } catch (err) {
    // viem errors run to many lines; the first one says what went wrong
    const message = (err instanceof Error ? err.message : String(err)).split('\n')[0]!
    work.attestationError = /exceeds allowance \(0\)|insufficient funds/i.test(message)
      ? "the agent's wallet has no gas (ETH on Base) yet"
      : message.replace(/\.+$/, '').slice(0, 300)
    logEvent('attest-failed', { workId: work.id, error: work.attestationError })
  }
  saveWorks()
}

/** Retries works still waiting for their on-chain proof. */
export async function attestPending(): Promise<void> {
  for (const work of works.values()) if (!work.attestation) await attest(work)
}
