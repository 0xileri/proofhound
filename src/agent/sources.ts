// The public feeds the agent watches: a short fixed list, so every run is cheap and predictable.
// Only feeds that carry full text are useful (Medium and HN send snippets). Reddit rate-limits
// anonymous readers hard, so its subreddits are read as one combined feed, with a pause between
// requests. The demo feed is ProofHound's own planted "copycat blog" (see web/demo.ts), so a demo
// run has something real to catch.
import { XMLParser } from 'fast-xml-parser'
import { logEvent } from '../core/ledger.js'

export interface Source {
  name: string
  url: string
}

export interface Item {
  source: string
  url: string
  title: string
  author: string | null
  publishedAt: string | null
  text: string
}

const USER_AGENT = 'ProofHound/0.1 (watches public feeds for copies of registered work)'
const PAUSE_MS = 3_000

export function sources(): Source[] {
  const list: Source[] = [
    {
      name: 'Reddit (r/shortstories, r/WritingPrompts, r/nosleep, r/OCPoetry)',
      url: 'https://www.reddit.com/r/shortstories+WritingPrompts+nosleep+OCPoetry/new/.rss?limit=100',
    },
    { name: 'DEV Community', url: 'https://dev.to/feed' },
  ]
  if (process.env.PUBLIC_URL) list.push({ name: 'Demo copycat blog', url: `${process.env.PUBLIC_URL}/demo/feed.xml` })
  return list
}

export async function fetchSources(list = sources()): Promise<Item[]> {
  const items: Item[] = []
  for (const [i, source] of list.entries()) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS))
    try {
      items.push(...(await fetchSource(source)))
    } catch (err) {
      logEvent('source-error', { source: source.name, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return items
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' })

async function fetchSource(source: Source): Promise<Item[]> {
  const res = await fetch(source.url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const doc: any = parser.parse(await res.text()) // parsed XML has no fixed shape
  const entries = doc.rss?.channel?.item ?? doc.feed?.entry ?? []
  return (Array.isArray(entries) ? entries : [entries]).map((entry) => toItem(source, entry)).filter((item) => item.text)
}

// RSS 2.0 items and Atom entries name the same things differently.
function toItem(source: Source, entry: any): Item {
  const link = typeof entry.link === 'string' ? entry.link : [entry.link].flat()[0]?.href
  const published = textOf(entry.published ?? entry.pubDate ?? entry.updated)
  return {
    source: source.name,
    url: String(link ?? ''),
    title: htmlToText(textOf(entry.title)),
    author: textOf(entry.author?.name ?? entry['dc:creator'] ?? entry.author) || null,
    publishedAt: published && !Number.isNaN(Date.parse(published)) ? new Date(published).toISOString() : null,
    text: htmlToText(textOf(entry['content:encoded'] ?? entry.content ?? entry.description ?? entry.summary))
      .replace(/\s*submitted by\s+\/u\/\S+.*$/s, ''), // Reddit's footer
  }
}

function textOf(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && '#text' in value) return String(value['#text'])
  return ''
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', hellip: '…',
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
      if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? entity
      const code = name[1]?.toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity
    })
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*\n\s*/g, '\n\n')
    .trim()
}
