// One watch run. The agent reads the feeds and matches locally for free; only if something looks
// like a copy does it claim a key, and it spends only on judging those matches. It rotates the
// key every few paid calls, revokes at once if a call costs far more than it should, and always
// revokes when the run ends: a key exists only while there is paid work to do.
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { randomBytes } from 'node:crypto'
import { sha256 } from '../core/fingerprint.js'
import { logEvent } from '../core/ledger.js'
import { readJson, writeJson } from '../core/store.js'
import { attestPending, works } from '../core/works.js'
import { claimKey, revokeKey, watch, type AgentKey } from './keys.js'
import { findHits, type Hit, type SentencePair } from './matcher.js'
import { connectOrbio } from './orbio.js'
import { fetchSources } from './sources.js'
import { judge, type Verdict } from './verdict.js'

export const POLICY = {
  runBudgetUsd: Number(process.env.RUN_BUDGET_USD ?? 0.25),
  maxVerdictUsd: Number(process.env.MAX_VERDICT_USD ?? 0.05),
  // 1 = every paid call gets a fresh key, so a leaked key is good for one call at most.
  rotateEvery: Number(process.env.ROTATE_EVERY_VERDICTS ?? 1),
  maxVerdicts: Number(process.env.MAX_VERDICTS_PER_RUN ?? 10),
  watchIntervalHours: Number(process.env.WATCH_INTERVAL_HOURS ?? 6),
}

export interface Match {
  id: string
  workId: string
  url: string
  source: string
  title: string
  author: string | null
  publishedAt: string | null
  foundAt: string
  coverage: number
  verbatim: number
  pairs: SentencePair[]
  verdict: (Verdict & { keyPrefix: string }) | null
}

export interface RunSummary {
  startedAt: string
  finishedAt: string
  itemsChecked: number
  hits: number
  verdicts: number
  copies: number
  spentUsd: number | null
  stoppedBecause: string | null
}

export const matches: Match[] = readJson<Match[]>('matches.json', [])
const seen = new Set(readJson<string[]>('seen.json', []))
let running = false

export const isRunning = () => running
const round6 = (n: number) => Math.round(n * 1e6) / 1e6

export async function runAgent(): Promise<RunSummary> {
  if (running) throw new Error('A run is already in progress')
  running = true
  const startedAt = new Date().toISOString()
  const counts = { itemsChecked: 0, hits: 0, verdicts: 0, copies: 0 }
  let orbio: Client | undefined
  let key: AgentKey | undefined
  let startBalance: number | undefined
  let stoppedBecause: string | null = null
  let summary: RunSummary | undefined
  try {
    orbio = await connectOrbio()
    startBalance = (await watch(orbio, 'run start')).balanceUsd
    logEvent('run-start', { balanceUsd: startBalance })
    await attestPending()

    const hits: Hit[] = []
    for (const item of await fetchSources()) {
      const id = `${item.url}#${sha256(item.text).slice(2, 18)}`
      if (seen.has(id)) continue
      seen.add(id)
      counts.itemsChecked++
      hits.push(...(await findHits(item, [...works.values()])))
    }
    writeJson('seen.json', [...seen].slice(-5000))
    counts.hits = hits.length

    let balance = startBalance
    for (const hit of hits.sort((a, b) => b.coverage - a.coverage)) {
      if (counts.verdicts >= POLICY.maxVerdicts) {
        stoppedBecause = `verdict cap reached (${POLICY.maxVerdicts})`
        break
      }
      // Pending holds make the balance look lower than it will settle, so this errs on the safe side.
      if (startBalance - balance >= POLICY.runBudgetUsd) {
        stoppedBecause = `run budget reached ($${POLICY.runBudgetUsd})`
        break
      }
      // The first paid call claims the key; every `rotateEvery` calls after that swap it for a new one.
      if (!key || counts.verdicts % POLICY.rotateEvery === 0) key = await claimKey(orbio)
      const verdict = await judge(key, hit)
      counts.verdicts++
      balance = (await watch(orbio, `after verdict ${counts.verdicts}`)).balanceUsd
      if (verdict.verdict === 'copy') counts.copies++
      matches.push(toMatch(hit, { ...verdict, keyPrefix: key.prefix }))
      writeJson('matches.json', matches)
      logEvent('verdict', {
        workId: hit.work.id,
        url: hit.item.url,
        verdict: verdict.verdict,
        confidence: verdict.confidence,
        costUsd: verdict.costUsd,
        tokens: verdict.tokens,
        keyPrefix: key.prefix,
      })
      if (verdict.costUsd > POLICY.maxVerdictUsd) {
        stoppedBecause = `spend anomaly: one verdict cost $${verdict.costUsd} (limit $${POLICY.maxVerdictUsd})`
        await revokeKey(orbio, stoppedBecause)
        key = undefined
        break
      }
    }
  } catch (err) {
    stoppedBecause = `error: ${err instanceof Error ? err.message : String(err)}`
    throw err
  } finally {
    if (orbio && key) await revokeKey(orbio, stoppedBecause ?? 'run finished').catch(() => {})
    const end = orbio ? await watch(orbio, 'run end').catch(() => undefined) : undefined
    summary = {
      startedAt,
      finishedAt: new Date().toISOString(),
      ...counts,
      spentUsd: end && startBalance !== undefined ? round6(startBalance - end.balanceUsd) : null,
      stoppedBecause,
    }
    logEvent('run-end', { ...summary })
    await orbio?.close().catch(() => {})
    running = false
  }
  return summary
}

function toMatch(hit: Hit, verdict: NonNullable<Match['verdict']>): Match {
  return {
    id: randomBytes(5).toString('hex'),
    workId: hit.work.id,
    url: hit.item.url,
    source: hit.item.source,
    title: hit.item.title,
    author: hit.item.author,
    publishedAt: hit.item.publishedAt,
    foundAt: new Date().toISOString(),
    coverage: hit.coverage,
    verbatim: hit.verbatim,
    pairs: hit.pairs,
    verdict,
  }
}
