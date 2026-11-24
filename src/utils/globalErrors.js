// Safe client error logging: name + message + stack only, with URLs'
// query strings and anything token-like stripped. Never throws.
const MAX = 20
let seen = 0

function scrub(text) {
  return String(text ?? '')
    .replace(/(https?:\/\/[^\s?#)]+)[?#][^\s)]*/g, '$1')
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt>')
    .replace(/(bearer\s+)[\w.-]+/gi, '$1<redacted>')
    .slice(0, 600)
}

export function logClientError(where, error, info) {
  try {
    if (seen++ >= MAX) return
    console.error(
      `[client-error] ${where}: ${scrub(error?.name)}: ${scrub(error?.message ?? error)}`,
      scrub(info?.componentStack || error?.stack || '')
    )
  } catch {
    // logging must never throw
  }
}

export function installGlobalErrorHandlers() {
  window.addEventListener('error', (e) => {
    logClientError('window.onerror', e.error || e.message)
  })
  window.addEventListener('unhandledrejection', (e) => {
    logClientError('unhandledrejection', e.reason)
  })
}
