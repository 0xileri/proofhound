import { html, raw } from 'hono/html'
import type { HtmlEscapedString } from 'hono/utils/html'

export type Html = HtmlEscapedString | Promise<HtmlEscapedString>

const REPO_URL = process.env.REPO_URL

export function layout(title: string, body: Html): Html {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="Prove you made it first. An AI agent on its own Orbio key watches for copies of your writing.">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🐕</text></svg>">
<style>${raw(CSS)}</style>
</head>
<body>
<header class="top">
  <a class="brand" href="/"><span aria-hidden="true">🐕</span> ProofHound</a>
  <nav><a href="/">Register</a><a href="/agent">The agent</a>${REPO_URL ? html`<a href="${REPO_URL}">Code</a>` : ''}</nav>
</header>
<main>${body}</main>
<footer>Runs on its own <a href="https://orbio.so">Orbio</a> key · proofs on <a href="https://base.easscan.org">Base</a> · built for Orbio Build Week</footer>
</body>
</html>`
}

const CSS = `
:root {
  --bg: #fbfaf7; --surface: #ffffff; --text: #1d1b16; --muted: #6b665c; --line: #e7e2d8;
  --accent: #b4532a; --accent-text: #ffffff;
  --copy: #b42318; --copy-bg: #fdecea; --clear: #1f7a4d; --clear-bg: #e8f5ee; --maybe: #9a6700; --maybe-bg: #fff4d6;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #15140f; --surface: #1e1c16; --text: #ede8dd; --muted: #a39d90; --line: #34302666;
    --accent: #e0875b; --accent-text: #1d1b16;
    --copy: #ff8a80; --copy-bg: #3a1714; --clear: #7fd6a4; --clear-bg: #13301f; --maybe: #f2c14e; --maybe-bg: #33280c;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
a { color: var(--accent); }
main { max-width: 880px; margin: 0 auto; padding: 8px 16px 64px; }
.top { max-width: 880px; margin: 0 auto; padding: 18px 16px; display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
.brand { font-weight: 700; font-size: 1.15rem; color: var(--text); text-decoration: none; }
.top nav { display: flex; gap: 18px; }
.top nav a { color: var(--muted); text-decoration: none; }
.top nav a:hover { color: var(--text); }
footer { text-align: center; color: var(--muted); font-size: .85rem; padding: 32px 16px; border-top: 1px solid var(--line); }
footer a { color: inherit; }
h1 { font-size: clamp(1.8rem, 5vw, 2.6rem); line-height: 1.15; margin: 24px 0 12px; letter-spacing: -.02em; }
h2 { font-size: 1.15rem; margin: 0 0 12px; }
.lede { font-size: 1.1rem; color: var(--muted); max-width: 680px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 20px; margin: 20px 0; }
label { display: block; font-weight: 600; margin: 14px 0 6px; }
.hint { font-weight: 400; color: var(--muted); font-size: .9rem; }
input, textarea { width: 100%; font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }
textarea { resize: vertical; min-height: 220px; }
input:focus, textarea:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
button, .button { display: inline-block; font: inherit; font-weight: 600; background: var(--accent); color: var(--accent-text); border: 0; border-radius: 10px; padding: 11px 18px; cursor: pointer; text-decoration: none; }
button[disabled] { opacity: .6; cursor: progress; }
.row { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-top: 18px; }
.error { background: var(--copy-bg); color: var(--copy); padding: 10px 12px; border-radius: 10px; margin: 0 0 8px; }
.fineprint, .meta { color: var(--muted); font-size: .88rem; }
.steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin: 8px 0; }
.steps div { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 16px; }
.steps b { display: block; margin-bottom: 4px; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 20px 0; }
.stat { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; }
.stat span { display: block; color: var(--muted); font-size: .85rem; }
.stat strong { display: block; font-size: 1.35rem; margin-top: 2px; font-variant-numeric: tabular-nums; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 18px; margin: 0 0 16px; }
dt { color: var(--muted); }
dd { margin: 0; overflow-wrap: anywhere; }
.mono { font-family: var(--mono); font-size: .85rem; }
.pending { background: var(--maybe-bg); color: var(--maybe); padding: 10px 12px; border-radius: 10px; }
.badge { display: inline-block; font-size: .78rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; padding: 3px 9px; border-radius: 99px; }
.badge.copy { background: var(--copy-bg); color: var(--copy); }
.badge.coincidence { background: var(--clear-bg); color: var(--clear); }
.badge.unclear { background: var(--maybe-bg); color: var(--maybe); }
.match { border-left: 4px solid var(--line); }
.match.copy { border-left-color: var(--copy); }
.match.coincidence { border-left-color: var(--clear); }
.match.unclear { border-left-color: var(--maybe); }
.match h3 { margin: 8px 0 4px; font-size: 1.05rem; }
.reason { font-size: 1.02rem; margin: 10px 0; }
table { width: 100%; border-collapse: collapse; font-size: .92rem; margin-top: 10px; }
th, td { text-align: left; vertical-align: top; padding: 8px; border-top: 1px solid var(--line); }
th { color: var(--muted); font-weight: 600; }
.pairs td:last-child { white-space: nowrap; font-variant-numeric: tabular-nums; }
details summary { cursor: pointer; color: var(--accent); margin-top: 8px; }
.timeline { list-style: none; padding: 0; margin: 0; }
.timeline li { display: grid; grid-template-columns: 84px 1fr; gap: 12px; padding: 9px 0; border-top: 1px solid var(--line); }
.timeline li:first-child { border-top: 0; }
.tag { font-size: .72rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); padding-top: 3px; }
.tag.claim, .tag.rotate { color: var(--accent); }
.tag.revoke { color: var(--copy); }
.tag.verdict { color: var(--maybe); }
.tag.stamp { color: var(--clear); }
.list { list-style: none; padding: 0; margin: 0; }
.list li { padding: 8px 0; border-top: 1px solid var(--line); display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.list li:first-child { border-top: 0; }
.spark { width: 100%; height: 90px; display: block; }
.spark path { fill: none; stroke: var(--accent); stroke-width: 2; vector-effect: non-scaling-stroke; }
.excerpt { white-space: pre-line; color: var(--muted); }
.demo-banner { background: var(--maybe-bg); color: var(--maybe); padding: 10px 14px; border-radius: 10px; }
`
