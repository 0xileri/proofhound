// Signs the agent in to Orbio (once, in the browser), then prints the MCP's real tools and the
// results of its read-only calls, so the key lifecycle is built on Orbio's actual interface.
import '../env.js'
import { connectOrbio } from '../agent/orbio.js'

// A key must never reach the logs, even if a tool echoes one back.
const SECRET_FIELD = /key|secret|token/i
function redact(value: unknown): string {
  const json =
    typeof value === 'string'
      ? value
      : JSON.stringify(
          value,
          (field, v) => (SECRET_FIELD.test(field) && typeof v === 'string' && v.length > 16 ? `${v.slice(0, 6)}…` : v),
          2,
        )
  return json.replace(/sk-or-[\w-]{8,}/g, (key) => `${key.slice(0, 12)}…`)
}

const client = await connectOrbio({ interactive: true })
console.log('Signed in to Orbio.')

const { tools } = await client.listTools()
for (const tool of tools) {
  console.log(`\n## ${tool.name}\n${tool.description ?? ''}`)
  console.log(redact({ input: tool.inputSchema, output: tool.outputSchema, annotations: tool.annotations }))
}

// Only calls that change nothing. Creating or revoking a key waits for the user's go-ahead.
for (const tool of tools) {
  const readOnly = /^orbio_get_/.test(tool.name) && tool.annotations?.readOnlyHint !== false
  if (!readOnly || (tool.inputSchema.required?.length ?? 0) > 0) continue
  const result = await client.callTool({ name: tool.name, arguments: {} })
  console.log(`\n## ${tool.name} →`)
  console.log(redact(result.structuredContent ?? result.content))
}

await client.close()
