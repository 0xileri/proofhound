// On-chain proof: an EAS attestation on Base, signed by the agent's own wallet. Only hashes go
// on-chain; the attestation's block time is the "registered at" timestamp anyone can verify.
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodePacked,
  formatEther,
  http,
  keccak256,
  parseAbi,
  parseAbiParameters,
  parseEventLogs,
  zeroAddress,
  zeroHash,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'

// EAS is predeployed on Base (as on every OP Stack chain).
const EAS_ADDRESS: Address = '0x4200000000000000000000000000000000000021'
const SCHEMA_REGISTRY_ADDRESS: Address = '0x4200000000000000000000000000000000000020'

export const SCHEMA = 'bytes32 contentSha256,bytes32 embeddingSha256,string workId'
const SCHEMA_RESOLVER = zeroAddress
const SCHEMA_REVOCABLE = false // a proof of "had it by then" should never be withdrawable
// EAS derives a schema's UID from its definition, so it is known before registration.
export const SCHEMA_UID = keccak256(
  encodePacked(['string', 'address', 'bool'], [SCHEMA, SCHEMA_RESOLVER, SCHEMA_REVOCABLE]),
)
export const EXPLORER = 'https://base.easscan.org'
export const BASESCAN = 'https://basescan.org'

const registryAbi = parseAbi([
  'function register(string schema, address resolver, bool revocable) returns (bytes32)',
  'function getSchema(bytes32 uid) view returns ((bytes32 uid, address resolver, bool revocable, string schema))',
])
const easAbi = parseAbi([
  'function attest((bytes32 schema, (address recipient, uint64 expirationTime, bool revocable, bytes32 refUID, bytes data, uint256 value) data) request) payable returns (bytes32)',
  'event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)',
])

export interface Attestation {
  uid: Hex
  txHash: Hex
  attester: Address
  timestamp: string
  url: string
}

function clients() {
  const privateKey = process.env.AGENT_WALLET_PRIVATE_KEY as Hex | undefined
  if (!privateKey) throw new Error('AGENT_WALLET_PRIVATE_KEY is not set. Run `npm run chain:setup` first.')
  const account = privateKeyToAccount(privateKey)
  const transport = http(process.env.BASE_RPC_URL ?? 'https://mainnet.base.org')
  return {
    account,
    publicClient: createPublicClient({ chain: base, transport }),
    walletClient: createWalletClient({ account, chain: base, transport }),
  }
}

export async function walletStatus() {
  const { account, publicClient } = clients()
  const [wei, schema] = await Promise.all([
    publicClient.getBalance({ address: account.address }),
    publicClient.readContract({
      address: SCHEMA_REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: 'getSchema',
      args: [SCHEMA_UID],
    }),
  ])
  return { address: account.address, eth: formatEther(wei), wei, schemaRegistered: schema.uid !== zeroHash }
}

/** Registers the ProofHound schema once; a no-op when it already exists. */
export async function ensureSchema(): Promise<Hex> {
  if ((await walletStatus()).schemaRegistered) return SCHEMA_UID
  const { publicClient, walletClient } = clients()
  const hash = await walletClient.writeContract({
    address: SCHEMA_REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: 'register',
    args: [SCHEMA, SCHEMA_RESOLVER, SCHEMA_REVOCABLE],
  })
  await publicClient.waitForTransactionReceipt({ hash })
  return SCHEMA_UID
}

export async function attestWork(work: {
  contentSha256: Hex
  embeddingSha256: Hex
  workId: string
  recipient?: Address
}): Promise<Attestation> {
  const { account, publicClient, walletClient } = clients()
  const data = encodeAbiParameters(parseAbiParameters(SCHEMA), [
    work.contentSha256,
    work.embeddingSha256,
    work.workId,
  ])
  const txHash = await walletClient.writeContract({
    address: EAS_ADDRESS,
    abi: easAbi,
    functionName: 'attest',
    args: [
      {
        schema: SCHEMA_UID,
        data: {
          recipient: work.recipient ?? zeroAddress,
          expirationTime: 0n,
          revocable: SCHEMA_REVOCABLE,
          refUID: zeroHash,
          data,
          value: 0n,
        },
      },
    ],
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
  const [attested] = parseEventLogs({ abi: easAbi, eventName: 'Attested', logs: receipt.logs })
  if (!attested) throw new Error(`No Attested event in ${txHash}`)
  const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber })
  return {
    uid: attested.args.uid,
    txHash,
    attester: account.address,
    timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
    url: `${EXPLORER}/attestation/view/${attested.args.uid}`,
  }
}
