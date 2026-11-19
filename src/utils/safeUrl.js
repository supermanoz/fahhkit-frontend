// Guards for every URL that comes from the server (broadcast links, sponsor
// links, payment URLs) or from our own query string before it is opened,
// navigated to or put in an href. A hostile or mistaken value such as
// `javascript:...`, `data:...`, `intent:` or `file:` must never be opened;
// React does not strip those from `href`.

function parse(url) {
  if (typeof url !== 'string') return null
  try {
    return new URL(url.trim())
  } catch {
    return null
  }
}

// http(s) only, and no `user:pass@host` credentials (a classic way to make
// a link look like it points somewhere it does not).
export function isSafeExternalUrl(url) {
  const u = parse(url)
  return Boolean(
    u &&
    (u.protocol === 'https:' || u.protocol === 'http:') &&
    !u.username &&
    !u.password
  )
}

// Returns the normalized URL when safe, else undefined - drop-in for
// `href={safeHref(x)}` (an undefined href makes the anchor inert).
export function safeHref(url) {
  return isSafeExternalUrl(url) ? parse(url).href : undefined
}

// Payment pages: https only (never http) on top of the checks above.
export function isSafePaymentUrl(url) {
  const u = parse(url)
  return Boolean(u && u.protocol === 'https:' && isSafeExternalUrl(url))
}

// Same-site check for the places that build links to our own sites.
export function isAllowedHost(url, allowedHosts) {
  const u = parse(url)
  if (!u) return false
  return allowedHosts.some(
    (h) => u.hostname === h || u.hostname.endsWith(`.${h}`)
  )
}

// Navigates to a payment URL the backend returned, or throws so the caller's
// existing error handling shows "could not start payment".
export function navigateToPayment(url) {
  if (!isSafePaymentUrl(url)) {
    throw new Error('Unexpected payment link')
  }
  window.location.href = new URL(url).href
}

// ids that arrive in our own query string (?registrationId=...) and are
// interpolated into API paths: digits only.
export function numericId(value) {
  return typeof value === 'string' && /^\d{1,18}$/.test(value) ? value : null
}
