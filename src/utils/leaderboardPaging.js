// Leaderboard paging helpers (pure, unit-tested).
//
// Backend today (feature/territory-game, LeaderboardController):
//   - POST /v1/leaderboard/individual/find and /club/find take
//     {pageNumber (1-based), noOfRecords} and return a Spring Page
//     (content, totalPages, totalElements, last) - SERVER paging, each row
//     carries its own `rank`. Used by the Global boards.
//   - GET /individual/top/local?limit=&cityId= and /club/top/national?limit=
//     &countryId= return a plain list capped by `limit`, no offset - so those
//     (District / Country) are fetched ONCE and sliced here (CLIENT paging).
//   - Nothing returns "my rank": the pinned row only knows it when the player
//     is in a loaded page.
export const PAGE_SIZE = 20
// How many rows the limit-only endpoints are asked for (5 pages of 20).
export const CLIENT_LIMIT = 100

// Normalises a Spring Page response for `page` (1-based).
export function pageFromServer(resp, page, size = PAGE_SIZE) {
  const rows = Array.isArray(resp?.content) ? resp.content : []
  let hasNext
  if (typeof resp?.totalPages === 'number') hasNext = page < resp.totalPages
  else if (typeof resp?.last === 'boolean') hasNext = !resp.last
  else hasNext = rows.length >= size
  return { rows, hasNext }
}

// One page of an in-memory list.
export function sliceClientPage(all, page, size = PAGE_SIZE) {
  const list = Array.isArray(all) ? all : []
  const start = (page - 1) * size
  return {
    rows: list.slice(start, start + size),
    hasNext: start + size < list.length,
  }
}

// "1-20", "21-40" - by the rows' own ranks when they have them.
export function rangeLabel(rows, page, size = PAGE_SIZE) {
  if (!rows?.length) return ''
  const first = rows[0]?.rank ?? (page - 1) * size + 1
  const last = rows[rows.length - 1]?.rank ?? first + rows.length - 1
  return `${formatRank(first)}-${formatRank(last)}`
}

// 1178 -> "1,178"; unknown -> "—" (never a made-up number).
export function formatRank(rank) {
  const n = Number(rank)
  if (rank == null || !Number.isFinite(n) || n < 1) return '—'
  return Math.round(n).toLocaleString('en-US').replace(/[  ]/g, ',')
}
