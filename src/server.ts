// ProofHound's web app and the agent's schedule, in one process.
import './env.js'
import { serve } from '@hono/node-server'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { watch } from './agent/keys.js'
import { connectOrbio } from './agent/orbio.js'
import { isRunning, matches, POLICY, runAgent } from './agent/run.js'
import { agentStatus } from './agent/status.js'
import { SCHEMA, SCHEMA_UID } from './chain/eas.js'
import { EMBEDDING_MODEL } from './core/fingerprint.js'
import { logEvent } from './core/ledger.js'
import { RegistrationError, registerWork, works, type Work } from './core/works.js'
import { demoFeedXml, demoPost, SAMPLE_WORK } from './web/demo.js'
import { agentPage, demoPostPage, homePage, notFoundPage, workPage } from './web/pages.js'

const PORT = Number(process.env.PORT ?? 3000)
const PUBLIC_URL = (process.env.PUBLIC_URL ??= `http://localhost:${PORT}`)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN
const BALANCE_CHECK_MINUTES = Number(process.env.BALANCE_CHECK_MINUTES ?? 60)
const HOUR = 3_600_000

// Every registration costs the agent gas, so no single visitor can drain its wallet.
const PER_IP_PER_HOUR = 5
const PER_DAY = 100
const hourly = new Map<string, number[]>()
let daily: number[] = []

function allowRegistration(ip: string): boolean {
  const now = Date.now()
  const mine = (hourly.get(ip) ?? []).filter((t) => now - t < HOUR)
  daily = daily.filter((t) => now - t < 24 * HOUR)
  if (mine.length >= PER_IP_PER_HOUR || daily.length >= PER_DAY) return false
  hourly.set(ip, [...mine, now])
  daily.push(now)
  return true
}

const clientIp = (c: Context) => c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
const recentWorks = () => [...works.values()].slice(-6).reverse()

function proofPack(work: Work) {
  return {
    format: 'proofhound/1',
    page: `${PUBLIC_URL}/w/${work.id}`,
    work: {
      id: work.id,
      title: work.title,
      author: work.author,
      registeredAt: work.registeredAt,
      contentSha256: work.contentSha256,
      hashing: 'SHA-256 of the UTF-8 text after converting line endings to \\n and trimming outer whitespace',
      embeddingSha256: work.embeddingSha256,
      embeddingModel: EMBEDDING_MODEL,
    },
    attestation: work.attestation && { chain: 'Base (chain id 8453)', schema: SCHEMA, schemaUid: SCHEMA_UID, ...work.attestation },
    matches: matches
      .filter((m) => m.workId === work.id)
      .map(({ id: _id, workId: _workId, ...match }) => match),
    generatedAt: new Date().toISOString(),
  }
}

const app = new Hono()

app.get('/', (c) =>
  c.html(homePage({ values: c.req.query('sample') ? SAMPLE_WORK : undefined, recent: recentWorks(), agent: agentStatus() })),
)

app.post('/register', bodyLimit({ maxSize: 100 * 1024 }), async (c) => {
  const form = await c.req.parseBody()
  const values = {
    title: String(form.title ?? ''),
    author: String(form.author ?? ''),
    text: String(form.text ?? ''),
    wallet: String(form.wallet ?? ''),
  }
  const page = (error: string) => homePage({ values, error, recent: recentWorks(), agent: agentStatus() })
  if (!allowRegistration(clientIp(c))) return c.html(page('Too many registrations from here. Try again in an hour.'), 429)
  try {
    const work = await registerWork(values)
    return c.redirect(`/w/${work.id}`, 303)
  } catch (err) {
    if (err instanceof RegistrationError) return c.html(page(err.message), 400)
    throw err
  }
})

app.get('/w/:id', (c) => {
  const work = works.get(c.req.param('id'))
  if (!work) return c.html(notFoundPage(), 404)
  return c.html(workPage(work, matches.filter((m) => m.workId === work.id).reverse(), agentStatus()))
})

app.get('/w/:id/proof.json', (c) => {
  const work = works.get(c.req.param('id'))
  if (!work) return c.json({ error: 'not found' }, 404)
  c.header('content-disposition', `attachment; filename="proofhound-${work.id}.json"`)
  return c.json(proofPack(work))
})

app.get('/agent', (c) => c.html(agentPage(agentStatus())))
app.get('/api/agent', (c) => c.json(agentStatus()))

// Starts a watch run now instead of waiting for the schedule. Admin only: runs spend credits.
app.post('/api/agent/run', (c) => {
  if (!ADMIN_TOKEN || c.req.header('authorization') !== `Bearer ${ADMIN_TOKEN}`) return c.json({ error: 'unauthorized' }, 401)
  if (isRunning()) return c.json({ error: 'a run is already in progress' }, 409)
  runAgent().catch((err) => console.error('watch run failed:', err))
  return c.json({ started: true }, 202)
})

app.get('/demo/feed.xml', (c) =>
  c.body(demoFeedXml(PUBLIC_URL), 200, { 'content-type': 'application/rss+xml; charset=utf-8' }),
)
app.get('/demo/:slug', (c) => {
  const post = demoPost(c.req.param('slug'))
  return post ? c.html(demoPostPage(post)) : c.html(notFoundPage(), 404)
})

app.notFound((c) => c.html(notFoundPage(), 404))

serve({ fetch: app.fetch, port: PORT }, () => console.log(`ProofHound on ${PUBLIC_URL}`))

// The schedule: a watch run every few hours, and a balance reading every hour so the dashboard
// shows credits accruing from $ORBIO holdings between runs.
async function checkBalance(): Promise<void> {
  if (isRunning()) return
  try {
    const orbio = await connectOrbio()
    await watch(orbio, 'scheduled')
    await orbio.close()
  } catch (err) {
    logEvent('watch-error', { error: err instanceof Error ? err.message : String(err) })
  }
}

if (process.env.AGENT_SCHEDULE !== 'off') {
  setTimeout(checkBalance, 10_000)
  setInterval(checkBalance, BALANCE_CHECK_MINUTES * 60_000)
  setInterval(() => {
    if (!isRunning()) runAgent().catch((err) => console.error('watch run failed:', err))
  }, POLICY.watchIntervalHours * HOUR)
}
