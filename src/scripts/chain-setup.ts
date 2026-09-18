// Gives the agent a Base wallet on first run (private key appended to .env, which is gitignored),
// shows what it holds, and registers the ProofHound EAS schema once the wallet has gas.
import '../env.js'
import { appendFileSync } from 'node:fs'
import { generatePrivateKey } from 'viem/accounts'
import { BASESCAN, ensureSchema, EXPLORER, SCHEMA, SCHEMA_UID, walletStatus } from '../chain/eas.js'

if (!process.env.AGENT_WALLET_PRIVATE_KEY) {
  const privateKey = generatePrivateKey()
  appendFileSync('.env', `AGENT_WALLET_PRIVATE_KEY=${privateKey}\n`)
  process.env.AGENT_WALLET_PRIVATE_KEY = privateKey
  console.log('Created a new agent wallet (private key saved to .env).')
}

const status = await walletStatus()
console.log(`agent wallet  ${status.address}`)
console.log(`balance       ${status.eth} ETH on Base  (${BASESCAN}/address/${status.address})`)
console.log(`schema        ${SCHEMA}`)
console.log(`schema uid    ${SCHEMA_UID}  ${status.schemaRegistered ? 'registered' : 'not registered yet'}`)

if (!status.schemaRegistered) {
  if (status.wei === 0n) {
    console.log('\nSend a little ETH on Base (about $1) to the address above, then run this again.')
  } else {
    await ensureSchema()
    console.log(`registered    ${EXPLORER}/schema/view/${SCHEMA_UID}`)
  }
}
