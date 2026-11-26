// The ONE place the app learns which backend it talks to. Values come from the
// per-mode env files (.env.production = prod API, .env.staging = test API),
// chosen by the build script (build:prod / build:test). Nothing else in src/
// should read VITE_API_* or hardcode a backend URL.
import { DEBUG_INFO } from './debugInfo'

const env = import.meta.env

export const API_BASE_URL = env.VITE_API_BASE_URL || 'http://localhost:8080'
export const API_FALLBACK_URL = env.VITE_API_FALLBACK_URL || ''
export const FILE_BASE_URL = env.VITE_FILE_BASE_URL || API_BASE_URL

// 'production' | 'test' | 'local' | 'other'. The explicit label wins; else
// it is read off the URL.
// (Deliberately no URL constants here: the production bundle must not contain
// the test backend's address. The build guard checks the URL itself.)
function targetOfUrl(url) {
  if (/^https?:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.)/.test(url))
    return 'local'
  return /-test\/?$/.test(url) ? 'test' : 'production'
}
export const BACKEND_TARGET =
  env.VITE_BACKEND_TARGET || targetOfUrl(API_BASE_URL)
export const IS_TEST_BACKEND = BACKEND_TARGET === 'test'

// "1.1.1" -> "1.1.1 · test" on the test backend, in debug builds only
// (DEBUG_INFO): a player on a staging build never sees an environment label.
export function withBackendLabel(
  version,
  isTest = IS_TEST_BACKEND,
  debug = DEBUG_INFO
) {
  return isTest && debug
    ? [version, 'test'].filter(Boolean).join(' · ')
    : version
}
