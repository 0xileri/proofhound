// What the dashboard and /api/agent show, all derived from the ledger: every number is a real
// reading or a recorded spend, never an estimate.
import { readLedger, type LedgerEntry } from '../core/ledger.js'
import { works } from '../core/works.js'
import { VERDICT_MODEL } from './llm.js'
import { COVERAGE_THRESHOLD, VERBATIM_THRESHOLD } from './matcher.js'
import { isRunning, POLICY } from './run.js'
import { sources, type Source } from './sources.js'

export interface AgentStatus {
  balanceUsd: number | null
  accruedUsd: number | null
  spentOnVerdictsUsd: number
  keyPrefix: string | null
  lastRunAt: string | null
  running: boolean
  works: number
  counts: { claims: number; rotations: number; revocations: number; verdicts: number; copies: number; runs: number }
  history: { at: string; balanceUsd: number; accruedUsd: number }[]
  events: LedgerEntry[]
  sources: Source[]
  policy: typeof POLICY & { model: string; coverageThreshold: number; verbatimThreshold: number }
}

export function agentStatus(): AgentStatus {
  const ledger = readLedger()
  const count = (event: string) => ledger.filter((e) => e.event === event).length
  const watches = ledger.filter((e) => e.event === 'watch')
  const latest = watches.at(-1)
  const verdicts = ledger.filter((e) => e.event === 'verdict')
  return {
    balanceUsd: latest ? Number(latest.balanceUsd) : null,
    accruedUsd: latest ? Number(latest.accruedUsd) : null,
    spentOnVerdictsUsd: Math.round(verdicts.reduce((sum, e) => sum + Number(e.costUsd ?? 0), 0) * 1e6) / 1e6,
    keyPrefix: latest?.hasKey ? String(latest.keyPrefix) : null,
    lastRunAt: ledger.findLast((e) => e.event === 'run-end')?.at ?? null,
    running: isRunning(),
    works: works.size,
    counts: {
      claims: count('claim'),
      rotations: count('rotate'),
      revocations: count('revoke'),
      verdicts: verdicts.length,
      copies: verdicts.filter((e) => e.verdict === 'copy').length,
      runs: count('run-end'),
    },
    history: watches
      .slice(-300)
      .map((e) => ({ at: e.at, balanceUsd: Number(e.balanceUsd), accruedUsd: Number(e.accruedUsd) })),
    events: ledger.filter((e) => e.event !== 'watch').slice(-80).reverse(),
    sources: sources(),
    policy: {
      ...POLICY,
      model: VERDICT_MODEL,
      coverageThreshold: COVERAGE_THRESHOLD,
      verbatimThreshold: VERBATIM_THRESHOLD,
    },
  }
}
