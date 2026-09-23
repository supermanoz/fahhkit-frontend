// Helpers for the <SearchFilters> component's `values` object: one string
// per field key, '' meaning "not filtering on this".
export function emptyFilterValues(fields) {
  return Object.fromEntries(fields.map((f) => [f.key, '']))
}

export function hasActiveFilters(values) {
  return Object.values(values).some((v) => String(v ?? '').trim() !== '')
}

// Normalises a backend date/datetime (ISO string or Date) to the yyyy-mm-dd
// shape an <input type="date"> produces, so client-side date filters can
// compare with ===. Returns '' when it can't be parsed.
export function toInputDate(value) {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10)
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// <input type="date"> gives yyyy-mm-dd; the backend's date filter
// (DynamicWhereClause) wants dd-MM-yyyy.
export function toBackendDate(inputDate) {
  const [y, m, d] = inputDate.split('-')
  return `${d}-${m}-${y}`
}
