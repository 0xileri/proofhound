// The agent's key lifecycle on the Orbio MCP: claim, watch, rotate, revoke. An Orbio account has
// one key and the agent owns it. The secret lives in .orbio/key.json (gitignored), never in logs;
// every lifecycle event and balance reading goes to the ledger, so the watch step has real numbers.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { logEvent } from '../core/ledger.js'

interface Usd {
  usd: number
  microUsd: string
}

interface Balance {
  wallets: string[]
  accrued: Usd
  spent: Usd
  balance: Usd
}

interface KeyStatus {
  hasKey: boolean
  prefix?: string | null
  lastUsedAt?: string | null
}

interface MintedKey {
  key: string
  prefix: string
  baseUrl: string
  replaced: boolean
}

export interface AgentKey {
  key: string
  prefix: string
  baseUrl: string
  claimedAt: string
}

export interface Reading {
  balanceUsd: number
  spentUsd: number
  accruedUsd: number
  hasKey: boolean
  keyPrefix: string | null
  lastUsedAt: string | null
}

const KEY_FILE = join(process.env.ORBIO_STATE_DIR ?? '.orbio', 'key.json')

async function callOrbio<T>(orbio: Client, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const result = await orbio.callTool({ name, arguments: args })
  const blocks = (result.content ?? []) as { type: string; text?: string }[]
  const text = blocks.find((block) => block.type === 'text')?.text
  if (result.isError) throw new Error(`${name} failed: ${text ?? 'no details'}`)
  if (result.structuredContent) return result.structuredContent as T
  if (text) return JSON.parse(text) as T
  throw new Error(`${name} returned nothing`)
}

export function currentKey(): AgentKey | undefined {
  return existsSync(KEY_FILE) ? (JSON.parse(readFileSync(KEY_FILE, 'utf8')) as AgentKey) : undefined
}

/** One reading of the balance and the key, written to the ledger. */
export async function watch(orbio: Client, note?: string): Promise<Reading> {
  const [balance, status] = await Promise.all([
    callOrbio<Balance>(orbio, 'orbio_get_balance'),
    callOrbio<KeyStatus>(orbio, 'orbio_get_key_status'),
  ])
  const reading: Reading = {
    balanceUsd: balance.balance.usd,
    spentUsd: balance.spent.usd,
    accruedUsd: balance.accrued.usd,
    hasKey: status.hasKey,
    keyPrefix: status.prefix ?? null,
    lastUsedAt: status.lastUsedAt ?? null,
  }
  logEvent('watch', { ...reading, ...(note && { note }) })
  return reading
}

/**
 * Mints the account's key. If one exists, Orbio retires it in the same call, so this is also
 * rotation. Orbio shows the secret exactly once, so it is saved before anything else happens.
 */
export async function claimKey(orbio: Client, label = 'proofhound-agent'): Promise<AgentKey> {
  const previous = currentKey()?.prefix
  const minted = await callOrbio<MintedKey>(orbio, 'orbio_create_key', { label })
  const key: AgentKey = {
    key: minted.key,
    prefix: minted.prefix,
    baseUrl: minted.baseUrl,
    claimedAt: new Date().toISOString(),
  }
  mkdirSync(dirname(KEY_FILE), { recursive: true })
  writeFileSync(KEY_FILE, JSON.stringify(key, null, 2), { mode: 0o600 })
  if (minted.replaced) logEvent('rotate', { prefix: key.prefix, retired: previous ?? 'a key the agent did not hold' })
  else logEvent('claim', { prefix: key.prefix })
  return key
}

/** Stops the key on its next request. The balance is untouched; a new key can be claimed any time. */
export async function revokeKey(orbio: Client, reason: string): Promise<boolean> {
  const prefix = currentKey()?.prefix
  const { revoked } = await callOrbio<{ revoked: boolean }>(orbio, 'orbio_revoke_key')
  rmSync(KEY_FILE, { force: true })
  logEvent('revoke', { revoked, reason, ...(prefix && { prefix }) })
  return revoked
}
