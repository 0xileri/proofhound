// The key lifecycle, live on Orbio: claim → spend → watch → rotate (the old key stops working) →
// revoke. Spends a fraction of a cent; every step lands in the ledger.
import '../env.js'
import { claimKey, revokeKey, watch, type AgentKey, type Reading } from '../agent/keys.js'
import { gateway, VERDICT_MODEL } from '../agent/llm.js'
import { connectOrbio } from '../agent/orbio.js'
import { LEDGER_FILE } from '../core/ledger.js'

const usd = (n: number) => `$${n.toFixed(6)}`
const show = (step: string, r: Reading) =>
  console.log(
    `${step.padEnd(22)} balance ${usd(r.balanceUsd)} · spent ${usd(r.spentUsd)} · key ${r.keyPrefix ?? 'none'}` +
      (r.lastUsedAt ? ` · last used ${r.lastUsedAt}` : ''),
  )

async function ping(key: AgentKey) {
  const res = await gateway(key).chat.completions.create({
    model: VERDICT_MODEL,
    messages: [{ role: 'user', content: 'Reply with exactly one word: ready' }],
    max_tokens: 10,
  })
  return { text: res.choices[0]?.message.content?.trim() ?? '', tokens: res.usage?.total_tokens ?? 0 }
}

const orbio = await connectOrbio()

const start = await watch(orbio, 'start')
show('start', start)

const first = await claimKey(orbio)
console.log(`claimed ${first.prefix}… (secret saved to .orbio/key.json)`)

const reply = await ping(first)
console.log(`spent on ${VERDICT_MODEL}: "${reply.text}" (${reply.tokens} tokens)`)
const afterSpend = await watch(orbio, 'after first spend')
show('after spend', afterSpend)
console.log(`${''.padEnd(22)} Δ spent ${usd(afterSpend.spentUsd - start.spentUsd)}`)

const second = await claimKey(orbio)
console.log(`rotated ${first.prefix}… → ${second.prefix}…`)
const oldKeyAnswered = await ping(first).then(
  () => true,
  () => false,
)
console.log(`old key after rotation: ${oldKeyAnswered ? 'STILL ANSWERS (unexpected)' : 'rejected ✓'}`)

await revokeKey(orbio, 'end of lifecycle demo')
show('after revoke', await watch(orbio, 'end'))
console.log(`\nledger: ${LEDGER_FILE}`)
await orbio.close()
