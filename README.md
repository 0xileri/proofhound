# ProofHound 🐕

**Prove you made it first. Find out when it's copied.**

ProofHound is an AI agent that runs on its own [Orbio](https://orbio.so) key. A writer pastes their work; ProofHound fingerprints it, stamps the fingerprint on Base, and the agent watches public feeds for copies. It spends its own Orbio credits only to have Claude judge the few matches that look real.

Built for Orbio Build Week.

## The agent manages its own key

The agent signs in to the Orbio MCP (`https://www.orbio.so/api/mcp`) as its own OAuth client: one browser sign-in, then it refreshes its login headlessly. Everything below is a real Orbio MCP call, logged to `data/ledger.jsonl` and shown on the `/agent` dashboard.

| Step | What it does | Orbio MCP tool |
|---|---|---|
| **Claim** | Mints a key only when a run has paid work to do. | `orbio_create_key` |
| **Watch** | Reads the balance and key status before a run, after every paid call, and hourly. | `orbio_get_balance`, `orbio_get_key_status` |
| **Rotate** | Swaps to a fresh key before every further paid call (minting retires the old key in the same call), so a leaked key is good for one call at most. | `orbio_create_key` |
| **Revoke** | When the run ends, the moment a call costs more than the anomaly limit, and on errors. | `orbio_revoke_key` |

**Self-funding:** the credits come from holding $ORBIO. They accrue every hour from trading fees, and the dashboard charts the balance over time.

**Spend policy:** $0.25 budget per run, revoke if one call costs over $0.05, at most 10 verdicts per run. A verdict typically costs about $0.0045 (Claude Sonnet 5, ~1,800 tokens).

## How it works

1. **Register (free).** A SHA-256 of the exact text, plus sentence embeddings from a small open model (`all-MiniLM-L6-v2`) running on the server. No credits spent.
2. **Stamp on Base.** The hashes go into an [EAS](https://attest.org) attestation signed by the agent's wallet: schema `bytes32 contentSha256, bytes32 embeddingSha256, string workId`, not revocable. The block time is the creator's "had it by" date, checkable by anyone on [base.easscan.org](https://base.easscan.org).
3. **Watch (free).** Every 6 hours the agent reads public feeds and aligns each post with every registered work, sentence by sentence, locally. A post is flagged when at least 30% of a work's sentences have a close twin (cosine ≥ 0.80), or 15% of its 8-word phrases appear word for word.
4. **Judge (paid, on the agent's key).** Only flagged posts go to Claude Sonnet 5 through the Orbio gateway, with structured output: `copy`, `coincidence` or `unclear`, a confidence, and one sentence a creator can quote.
5. **Proof.** Each work gets a public proof page and a downloadable proof pack (JSON) with the hashes, the attestation, every match, the verdicts and the side-by-side evidence. Anyone can check a text against the proof in their browser.

## Measured

- Planted reworded copy: 69% of the story's sentences matched. Verbatim "author unknown" repost: 38% of sentences and 38% of phrases.
- 37 live Reddit and DEV posts: 0% matched (the closest single sentence reached 0.58), so the thresholds have a wide margin.
- First live run: 41 posts read, 2 flagged, both judged `copy` at 98% confidence, $0.0089 spent in total.

## The demo feed

`/demo/feed.xml` is a planted "copycat blog", so a demo can show a real catch: a reworded copy of the sample story, a verbatim "author unknown" repost, a loose poem retelling, and an unrelated post. Every other source is a live public feed: Reddit's r/shortstories, r/WritingPrompts, r/nosleep and r/OCPoetry, and DEV Community.

## Limits

- It finds copies in the feeds it watches. It cannot see inside AI training sets.
- Loose adaptations, like the demo's poem retelling, are not flagged. Sentence matching is built for reposts and paraphrases.
- A timestamp proves the creator had the text by that time, not that they wrote it.
- Text only for now.

## Run it

Node 22 or newer.

```bash
npm install
npm run orbio:login       # one browser sign-in; saves the agent's Orbio login in .orbio/
npm run chain:setup       # creates the agent's Base wallet (key in .env); fund it, then rerun to register the schema
npm run dev               # http://localhost:3000
npm run agent:run         # one watch run from the command line
npm run agent:lifecycle   # claim → spend → watch → rotate → revoke, live
```

Settings are in [.env.example](.env.example). `.env`, `.orbio/` and `data/` hold secrets and user data and are never committed.

## Code

- `src/agent/`: the agent. `orbio.ts` (Orbio MCP client and OAuth), `keys.ts` (claim, watch, rotate, revoke), `run.ts` (a watch run and its spend policy), `sources.ts`, `matcher.ts`, `verdict.ts`, `status.ts`
- `src/core/`: fingerprints, the registry of works, the ledger, storage
- `src/chain/eas.ts`: the EAS attestation on Base
- `src/web/` and `src/server.ts`: the site and the schedule
