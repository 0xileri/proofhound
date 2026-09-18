import { html, raw } from 'hono/html'
import type { AgentStatus } from '../agent/status.js'
import type { Match } from '../agent/run.js'
import { BASESCAN } from '../chain/eas.js'
import type { LedgerEntry } from '../core/ledger.js'
import type { Work } from '../core/works.js'
import { layout, type Html } from './layout.js'

const usd = (n: unknown, digits = 4) => (typeof n === 'number' ? `$${n.toFixed(digits)}` : '—')
const pct = (n: number) => `${Math.round(n * 100)}%`
const short = (hex: string, head = 10) => `${hex.slice(0, head)}…${hex.slice(-4)}`
// Feed links are untrusted: only http(s) may become an href.
const safeUrl = (url: string) => (/^https?:\/\//i.test(url) ? url : '#')

function ago(iso: string): string {
  const seconds = (Date.now() - Date.parse(iso)) / 1000
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`
  return `${Math.floor(seconds / 86400)} d ago`
}

interface FormValues {
  title?: string
  author?: string
  text?: string
  wallet?: string
}

export function homePage(opts: { values?: FormValues; error?: string; recent: Work[]; agent: AgentStatus }): Html {
  const v = opts.values ?? {}
  const { agent } = opts
  return layout(
    'ProofHound: prove you made it first',
    html`<section>
  <h1>Prove you made it first.<br>Find out when it's copied.</h1>
  <p class="lede">Paste your writing. ProofHound fingerprints it, stamps the fingerprint on Base so anyone can check when you had it, and an AI agent, running on its own Orbio key, watches public feeds for copies and judges each one.</p>
</section>

<form class="card" method="post" action="/register" id="register">
  ${opts.error ? html`<p class="error" role="alert">${opts.error}</p>` : ''}
  <label for="title">Title</label>
  <input id="title" name="title" required maxlength="120" value="${v.title ?? ''}">
  <label for="author">Your name or handle <span class="hint">optional; the agent ignores posts under this name</span></label>
  <input id="author" name="author" maxlength="60" value="${v.author ?? ''}">
  <label for="text">Your writing <span class="hint">at least 40 words</span></label>
  <textarea id="text" name="text" required>${v.text ?? ''}</textarea>
  <details>
    <summary>Add your wallet (optional)</summary>
    <label for="wallet">Base address to name as the attestation's recipient</label>
    <input id="wallet" name="wallet" placeholder="0x…" value="${v.wallet ?? ''}">
  </details>
  <div class="row">
    <button type="submit">Register and start watching</button>
    <a href="/?sample=1">Fill in the sample story</a>
  </div>
  <p class="fineprint">Only hashes go on-chain. The text is stored on this server so the agent can compare it with what it finds, and it is never shown publicly.</p>
</form>
<script>
  document.getElementById('register').addEventListener('submit', (e) => {
    const b = e.target.querySelector('button'); b.disabled = true; b.textContent = 'Fingerprinting and stamping on Base…'
  })
</script>

<h2>How it works</h2>
<div class="steps">
  <div><b>1 · Fingerprint, free</b>A hash of your exact text plus a sentence-by-sentence fingerprint, computed on this server with a small open model. No credits spent.</div>
  <div><b>2 · Stamp on Base</b>The hashes go into an <a href="https://attest.org">EAS</a> attestation. The block time is your "had it by" date, checkable by anyone.</div>
  <div><b>3 · Watch and judge</b>Every ${agent.policy.watchIntervalHours} hours the agent reads public feeds. Only close matches reach Claude, paid from the agent's own Orbio key.</div>
</div>

<section class="card">
  <h2>The agent right now</h2>
  <p>Balance <b>${usd(agent.balanceUsd, 2)}</b> · ${agent.counts.verdicts} verdicts, ${agent.counts.copies} copies found · key: ${agent.keyPrefix ? html`<span class="mono">${agent.keyPrefix}…</span>` : 'none (it only holds one during paid work)'} · last run ${agent.lastRunAt ? ago(agent.lastRunAt) : 'not yet'} · <a href="/agent">see everything it does</a></p>
</section>

${opts.recent.length
  ? html`<section class="card"><h2>Recently registered</h2><ul class="list">${opts.recent.map(
      (w) => html`<li><a href="/w/${w.id}">${w.title}</a><span class="meta">${w.attestation ? 'stamped on Base' : 'stamp pending'} · ${ago(w.registeredAt)}</span></li>`,
    )}</ul></section>`
  : ''}`,
  )
}

export function workPage(work: Work, matches: Match[], agent: AgentStatus): Html {
  const a = work.attestation
  return layout(
    `${work.title} · ProofHound`,
    html`<p class="meta"><a href="/">← Register another</a></p>
<h1>${work.title}</h1>
<p class="meta">${work.author ? html`by ${work.author} · ` : ''}registered ${new Date(work.registeredAt).toUTCString()}</p>

<section class="card">
  <h2>On-chain proof</h2>
  ${a
    ? html`<dl>
    <dt>Stamped on Base</dt><dd>${new Date(a.timestamp).toUTCString()} <span class="meta">(block time)</span></dd>
    <dt>Attestation</dt><dd><a class="mono" href="${a.url}">${short(a.uid)}</a></dd>
    <dt>Transaction</dt><dd><a class="mono" href="${BASESCAN}/tx/${a.txHash}">${short(a.txHash)}</a></dd>
    <dt>Text SHA-256</dt><dd class="mono">${work.contentSha256}</dd>
    <dt>Fingerprint SHA-256</dt><dd class="mono">${work.embeddingSha256}</dd>
    <dt>Signed by</dt><dd class="mono">${a.attester} <span class="meta">(the agent's wallet)</span></dd>
  </dl>`
    : html`<p class="pending">Waiting for the on-chain stamp${work.attestationError ? html`: ${work.attestationError}` : ''}. The agent retries on its next run.</p>
  <dl><dt>Text SHA-256</dt><dd class="mono">${work.contentSha256}</dd></dl>`}
  <details>
    <summary>Check a text against this proof</summary>
    <p class="meta">Paste the exact text. It is hashed in your browser and never sent anywhere.</p>
    <textarea id="check" rows="6"></textarea>
    <div class="row"><button type="button" id="check-button">Compare hashes</button><span id="check-result" class="meta"></span></div>
  </details>
  <div class="row"><a class="button" href="/w/${work.id}/proof.json">Download proof pack</a></div>
</section>
<script>
  document.getElementById('check-button').addEventListener('click', async () => {
    const text = document.getElementById('check').value.replace(/\\r\\n?/g, '\\n').trim()
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    const hex = '0x' + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    document.getElementById('check-result').textContent = hex === ${raw(JSON.stringify(work.contentSha256))} ? '✓ Same text as the proof' : '✗ Different text: ' + hex.slice(0, 18) + '…'
  })
</script>

<h2>What the agent found</h2>
${matches.length
  ? matches.map(matchCard)
  : html`<p class="card">Nothing yet. The agent checks ${agent.sources.length} public feeds every ${agent.policy.watchIntervalHours} hours, and anything that looks like your work shows up here with a verdict.</p>`}

<section class="card">
  <h2>Your text</h2>
  <p class="excerpt">${work.text.slice(0, 320)}${work.text.length > 320 ? '…' : ''}</p>
  <p class="fineprint">Only this opening is shown. The full text stays private.</p>
</section>`,
  )
}

const VERDICT_LABEL = { copy: 'Copy', coincidence: 'Coincidence', unclear: 'Unclear' } as const

function matchCard(m: Match): Html {
  const v = m.verdict
  return html`<article class="card match ${v?.verdict ?? ''}">
  ${v ? html`<span class="badge ${v.verdict}">${VERDICT_LABEL[v.verdict]}</span>` : ''}
  <h3><a href="${safeUrl(m.url)}" rel="nofollow noopener">${m.title || m.url}</a></h3>
  <p class="meta">on ${m.source}${m.author ? html` · by ${m.author}` : ''}${m.publishedAt ? html` · posted ${ago(m.publishedAt)}` : ''} · found ${ago(m.foundAt)}</p>
  ${v ? html`<p class="reason">“${v.reason}” <span class="meta">(${v.model.replace(/^[^/]+\//, '')}, ${pct(v.confidence)} sure)</span></p>` : ''}
  <p class="meta">${pct(m.coverage)} of your sentences have a close twin · ${pct(m.verbatim)} of your phrasing appears word for word${v ? html` · judged for ${usd(v.costUsd)} on key <span class="mono">${v.keyPrefix}…</span>` : ''}</p>
  <details>
    <summary>Side by side</summary>
    <table class="pairs"><thead><tr><th>Your sentence</th><th>What was found</th><th>Match</th></tr></thead><tbody>
    ${m.pairs.map((p) => html`<tr><td>${p.original}</td><td>${p.found}</td><td>${pct(p.similarity)}</td></tr>`)}
    </tbody></table>
  </details>
</article>`
}

const EVENT_TAG: Record<string, string> = {
  claim: 'claim', rotate: 'rotate', revoke: 'revoke', verdict: 'verdict', attest: 'stamp',
  'attest-failed': 'stamp', register: 'register', 'run-start': 'run', 'run-end': 'run',
  'source-error': 'feed', 'watch-error': 'watch',
}

function describe(e: LedgerEntry): Html | string {
  const key = (p: unknown) => html`<span class="mono">${String(p)}…</span>`
  switch (e.event) {
    case 'claim': return html`Claimed key ${key(e.prefix)}`
    case 'rotate': return html`Rotated key: retired ${key(e.retired)}, now ${key(e.prefix)}`
    case 'revoke': return html`Revoked key ${e.prefix ? key(e.prefix) : ''}: ${String(e.reason)}`
    case 'verdict': return html`Judged a match: <b>${String(e.verdict)}</b> (${pct(Number(e.confidence))}) for ${usd(e.costUsd)} on key ${key(e.keyPrefix)} · <a href="/w/${String(e.workId)}">work</a>`
    case 'attest': return html`Stamped a work on Base · <a href="/w/${String(e.workId)}">proof</a>`
    case 'attest-failed': return html`Could not stamp a work yet: ${String(e.error)}`
    case 'register': return html`A work was registered · <a href="/w/${String(e.workId)}">proof</a>`
    case 'run-start': return html`Watch run started, balance ${usd(e.balanceUsd)}`
    case 'run-end': return html`Run finished: ${String(e.itemsChecked)} new posts read, ${String(e.hits)} close matches, ${String(e.verdicts)} verdicts, spent ${usd(e.spentUsd)}${e.stoppedBecause ? html` · stopped: ${String(e.stoppedBecause)}` : ''}`
    case 'source-error': return html`Feed ${String(e.source)} failed: ${String(e.error)}`
    default: return String(e.event)
  }
}

function sparkline(points: { at: string; balanceUsd: number }[]): Html | string {
  if (points.length < 2) return html`<p class="meta">Not enough readings yet.</p>`
  const values = points.map((p) => p.balanceUsd)
  const [min, max] = [Math.min(...values), Math.max(...values)]
  const span = max - min || 1
  const d = values.map((value, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * 1000).toFixed(1)},${(90 - ((value - min) / span) * 80 - 5).toFixed(1)}`).join(' ')
  return html`<svg class="spark" viewBox="0 0 1000 90" preserveAspectRatio="none" role="img" aria-label="Balance from ${usd(values[0], 2)} to ${usd(values.at(-1), 2)}"><path d="${d}"></path></svg>
  <p class="meta">${usd(min, 4)} to ${usd(max, 4)} across ${points.length} readings since ${new Date(points[0]!.at).toUTCString()}</p>`
}

const rotation = (n: number) =>
  n === 1 ? 'swaps it for a fresh one before every further paid call' : `rotates it every ${n} paid calls`

export function agentPage(agent: AgentStatus): Html {
  return layout(
    'The agent · ProofHound',
    html`<h1>The agent</h1>
<p class="lede">ProofHound's agent runs on its own Orbio key, which it manages itself through the Orbio MCP. It claims a key only when it has paid work, ${rotation(agent.policy.rotateEvery)}, revokes it the moment one call costs more than ${usd(agent.policy.maxVerdictUsd, 2)}, and always revokes it when a run ends. Its credits come from holding $ORBIO and accrue every hour from trading fees.</p>

<div class="stats">
  <div class="stat"><span>Spendable balance</span><strong>${usd(agent.balanceUsd)}</strong></div>
  <div class="stat"><span>Earned from holding $ORBIO</span><strong>${usd(agent.accruedUsd)}</strong></div>
  <div class="stat"><span>Spent on verdicts</span><strong>${usd(agent.spentOnVerdictsUsd)}</strong></div>
  <div class="stat"><span>Key right now</span><strong>${agent.keyPrefix ? html`<span class="mono">${agent.keyPrefix}…</span>` : 'none'}</strong></div>
</div>
<div class="stats">
  <div class="stat"><span>Keys claimed</span><strong>${agent.counts.claims}</strong></div>
  <div class="stat"><span>Rotations</span><strong>${agent.counts.rotations}</strong></div>
  <div class="stat"><span>Revocations</span><strong>${agent.counts.revocations}</strong></div>
  <div class="stat"><span>Verdicts · copies</span><strong>${agent.counts.verdicts} · ${agent.counts.copies}</strong></div>
</div>

<section class="card">
  <h2>Balance over time</h2>
  ${sparkline(agent.history)}
</section>

<section class="card">
  <h2>What it did</h2>
  ${agent.running ? html`<p class="pending">A watch run is in progress.</p>` : ''}
  <ul class="timeline">${agent.events.map((e) => html`<li><span class="tag ${EVENT_TAG[e.event] ?? ''}">${EVENT_TAG[e.event] ?? e.event}</span><span>${describe(e)} <span class="meta">· ${ago(e.at)}</span></span></li>`)}</ul>
</section>

<section class="card">
  <h2>Rules it runs by</h2>
  <ul class="list">
    <li><span>Watch run</span><span>every ${agent.policy.watchIntervalHours} h, ${agent.sources.length} feeds</span></li>
    <li><span>Judge</span><span class="mono">${agent.policy.model}</span></li>
    <li><span>Budget per run</span><span>${usd(agent.policy.runBudgetUsd, 2)}</span></li>
    <li><span>Revoke if one call costs over</span><span>${usd(agent.policy.maxVerdictUsd, 2)}</span></li>
    <li><span>Rotate the key</span><span>${agent.policy.rotateEvery === 1 ? 'before every paid call' : `every ${agent.policy.rotateEvery} paid calls`}</span></li>
    <li><span>Flag a post when</span><span>${pct(agent.policy.coverageThreshold)} of sentences match, or ${pct(agent.policy.verbatimThreshold)} word for word</span></li>
  </ul>
  <p class="meta">Feeds: ${agent.sources.map((s, i) => html`${i ? ', ' : ''}<a href="${safeUrl(s.url)}">${s.name}</a>`)}. The demo feed is a planted copycat blog, so a demo run has something to catch.</p>
</section>`,
  )
}

export function demoPostPage(post: { title: string; text: string }): Html {
  return layout(
    `${post.title} · demo`,
    html`<p class="demo-banner">This is ProofHound's planted "copycat blog", used to demo a catch. It is not a real site.</p>
<h1>${post.title}</h1><p class="meta">by totally_original_writer</p>
<p class="excerpt">${post.text}</p>`,
  )
}

export function notFoundPage(): Html {
  return layout('Not found · ProofHound', html`<h1>Nothing here.</h1><p><a href="/">Back to ProofHound</a></p>`)
}
