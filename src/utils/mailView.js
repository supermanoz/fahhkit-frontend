// Pure helpers for the Mail page (no React/DOM) - dates, grouping, previews
// and safe link splitting. Copy lives in constants/mailCopy.js.
import { isSafeExternalUrl, safeHref } from './safeUrl'

export function formatMailDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Full date + time, for the detail view.
export function formatMailDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// "2h ago" style for a row's right-aligned time.
export function formatRelativeMailDate(value, now = Date.now()) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diffMin = Math.floor((now - date.getTime()) / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return formatMailDate(value)
}

// Today / Yesterday / Earlier by LOCAL calendar day (not a rolling 24h), so
// 11pm yesterday reads "Yesterday" even if it's only been a couple of hours.
export function mailDateGroup(value, now = new Date()) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Earlier'
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  )
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  if (date >= startOfToday) return 'Today'
  if (date >= startOfYesterday) return 'Yesterday'
  return 'Earlier'
}

// Groups in the fixed order Today / Yesterday / Earlier, skipping empty ones.
export function groupMailByDate(items, now = new Date()) {
  const buckets = { Today: [], Yesterday: [], Earlier: [] }
  for (const item of items)
    buckets[mailDateGroup(item.createdDate, now)].push(item)
  return ['Today', 'Yesterday', 'Earlier']
    .filter((label) => buckets[label].length > 0)
    .map((label) => ({ label, items: buckets[label] }))
}

// One-line preview of a body: its first non-empty line, whitespace collapsed,
// cut at `max` characters with an ellipsis.
export function mailPreview(body, max = 120) {
  const line = String(body ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .find(Boolean)
  if (!line) return ''
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

// Splits text into plain and link parts. Only http(s) URLs without embedded
// credentials become links (see utils/safeUrl.js); anything else stays text.
// Trailing sentence punctuation is not part of the link.
const URL_RE = /https?:\/\/[^\s<>"']+/gi
export function splitLinks(text) {
  const source = String(text ?? '')
  const parts = []
  let last = 0
  for (const match of source.matchAll(URL_RE)) {
    let url = match[0]
    let trailing = ''
    const punct = url.match(/[.,;:!?)\]]+$/)
    if (punct) {
      trailing = punct[0]
      url = url.slice(0, -trailing.length)
    }
    if (match.index > last) {
      parts.push({ type: 'text', value: source.slice(last, match.index) })
    }
    if (isSafeExternalUrl(url)) {
      parts.push({ type: 'link', value: url, href: safeHref(url) })
    } else {
      parts.push({ type: 'text', value: url })
    }
    if (trailing) parts.push({ type: 'text', value: trailing })
    last = match.index + match[0].length
  }
  if (last < source.length) {
    parts.push({ type: 'text', value: source.slice(last) })
  }
  // Neighbouring text pieces become one.
  return parts.reduce((merged, part) => {
    const prev = merged[merged.length - 1]
    if (prev && prev.type === 'text' && part.type === 'text') {
      prev.value += part.value
    } else {
      merged.push({ ...part })
    }
    return merged
  }, [])
}
