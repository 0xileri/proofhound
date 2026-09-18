// Append-only record of everything the agent does: key lifecycle, balance readings,
// attestations, verdicts and what they cost. The dashboard reads real numbers from here.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR } from './store.js'

export const LEDGER_FILE = join(DATA_DIR, 'ledger.jsonl')

export interface LedgerEntry {
  at: string
  event: string
  [field: string]: unknown
}

export function logEvent(event: string, data: Record<string, unknown> = {}): void {
  mkdirSync(DATA_DIR, { recursive: true })
  appendFileSync(LEDGER_FILE, JSON.stringify({ at: new Date().toISOString(), event, ...data }) + '\n')
}

export function readLedger(): LedgerEntry[] {
  if (!existsSync(LEDGER_FILE)) return []
  return readFileSync(LEDGER_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LedgerEntry)
}
