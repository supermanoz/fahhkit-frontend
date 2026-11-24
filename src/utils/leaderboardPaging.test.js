import { describe, expect, it } from 'vitest'
import {
  PAGE_SIZE,
  formatRank,
  pageFromServer,
  rangeLabel,
  sliceClientPage,
} from './leaderboardPaging'

const rows = (from, n) =>
  Array.from({ length: n }, (_, i) => ({
    rank: from + i,
    userId: `u${from + i}`,
  }))

describe('pageFromServer', () => {
  it('uses totalPages when present', () => {
    expect(
      pageFromServer({ content: rows(1, 20), totalPages: 3 }, 1).hasNext
    ).toBe(true)
    expect(
      pageFromServer({ content: rows(41, 7), totalPages: 3 }, 3).hasNext
    ).toBe(false)
  })
  it('falls back to `last`, then to a full page', () => {
    expect(
      pageFromServer({ content: rows(1, 20), last: false }, 1).hasNext
    ).toBe(true)
    expect(
      pageFromServer({ content: rows(1, 20), last: true }, 1).hasNext
    ).toBe(false)
    expect(pageFromServer({ content: rows(1, 20) }, 1).hasNext).toBe(true)
    expect(pageFromServer({ content: rows(1, 5) }, 1).hasNext).toBe(false)
  })
  it('junk -> empty page', () => {
    expect(pageFromServer(null, 1)).toEqual({ rows: [], hasNext: false })
  })
})

describe('sliceClientPage', () => {
  const all = rows(1, 45)
  it('slices 20 at a time', () => {
    expect(sliceClientPage(all, 1).rows).toHaveLength(PAGE_SIZE)
    expect(sliceClientPage(all, 1).hasNext).toBe(true)
    expect(sliceClientPage(all, 3).rows).toHaveLength(5)
    expect(sliceClientPage(all, 3).hasNext).toBe(false)
  })
  it('exactly 40 rows -> page 2 is the last', () => {
    expect(sliceClientPage(rows(1, 40), 2).hasNext).toBe(false)
  })
})

describe('rangeLabel / formatRank', () => {
  it('shows the rows own ranks', () => {
    expect(rangeLabel(rows(21, 20), 2)).toBe('21-40')
    expect(rangeLabel([], 1)).toBe('')
  })
  it('formats big ranks and never invents one', () => {
    expect(formatRank(1178)).toBe('1,178')
    expect(formatRank(7)).toBe('7')
    expect(formatRank(null)).toBe('—')
    expect(formatRank(undefined)).toBe('—')
    expect(formatRank(0)).toBe('—')
  })
})
