import { describe, expect, it } from 'vitest'
import {
  formatRelativeMailDate,
  groupMailByDate,
  mailDateGroup,
  mailPreview,
  splitLinks,
} from './mailView'

const NOW = new Date('2026-11-20T15:00:00')

describe('formatRelativeMailDate', () => {
  const ago = (ms) => new Date(NOW.getTime() - ms).toISOString()
  it('reads like a person would say it', () => {
    expect(formatRelativeMailDate(ago(20_000), NOW.getTime())).toBe('Just now')
    expect(formatRelativeMailDate(ago(5 * 60_000), NOW.getTime())).toBe(
      '5m ago'
    )
    expect(formatRelativeMailDate(ago(2 * 3600_000), NOW.getTime())).toBe(
      '2h ago'
    )
    expect(formatRelativeMailDate(ago(3 * 86400_000), NOW.getTime())).toBe(
      '3d ago'
    )
  })
  it('falls back to a short date after a week, and to "" for junk', () => {
    expect(formatRelativeMailDate(ago(20 * 86400_000), NOW.getTime())).toMatch(
      /\w/
    )
    expect(formatRelativeMailDate('nope', NOW.getTime())).toBe('')
    expect(formatRelativeMailDate(null, NOW.getTime())).toBe('')
  })
})

describe('date groups', () => {
  it('Today / Yesterday / Earlier by calendar day', () => {
    expect(mailDateGroup('2026-11-20T00:05:00', NOW)).toBe('Today')
    expect(mailDateGroup('2026-11-19T23:30:00', NOW)).toBe('Yesterday')
    expect(mailDateGroup('2026-11-18T12:00:00', NOW)).toBe('Earlier')
    expect(mailDateGroup('garbage', NOW)).toBe('Earlier')
  })
  it('keeps the fixed order and drops empty groups', () => {
    const items = [
      { id: 'a', createdDate: '2026-11-01T10:00:00' },
      { id: 'b', createdDate: '2026-11-20T09:00:00' },
    ]
    const g = groupMailByDate(items, NOW)
    expect(g.map((x) => x.label)).toEqual(['Today', 'Earlier'])
    expect(g[0].items[0].id).toBe('b')
  })
})

describe('mailPreview', () => {
  it('first non-empty line, collapsed, one line', () => {
    expect(mailPreview('\n\n  Hello   there  \nSecond line')).toBe(
      'Hello there'
    )
    expect(mailPreview(null)).toBe('')
  })
  it('cuts long text with an ellipsis', () => {
    const p = mailPreview('x'.repeat(300), 50)
    expect(p.length).toBe(50)
    expect(p.endsWith('…')).toBe(true)
  })
})

describe('splitLinks', () => {
  it('turns safe URLs into links and keeps the rest as text', () => {
    const parts = splitLinks('See https://example.com/a?b=1 for more.')
    expect(parts.map((p) => p.type)).toEqual(['text', 'link', 'text'])
    expect(parts[1]).toMatchObject({
      value: 'https://example.com/a?b=1',
      href: 'https://example.com/a?b=1',
    })
    expect(parts[2].value).toBe(' for more.')
  })
  it('leaves sentence punctuation out of the link', () => {
    const parts = splitLinks('Go to https://example.com/x, now!')
    expect(parts[1].value).toBe('https://example.com/x')
    expect(parts[2].value).toBe(', now!')
  })
  it('never makes a link out of an unsafe or credentialed URL', () => {
    expect(
      splitLinks('http://user:pw@evil.example/x').some((p) => p.type === 'link')
    ).toBe(false)
    // non-http schemes are not matched at all
    expect(
      splitLinks('javascript:alert(1) and data:text/html,hi').some(
        (p) => p.type === 'link'
      )
    ).toBe(false)
  })
  it('plain text is a single text part; empty is none', () => {
    expect(splitLinks('no links here')).toEqual([
      { type: 'text', value: 'no links here' },
    ])
    expect(splitLinks('')).toEqual([])
  })
})
