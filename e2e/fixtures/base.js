import { test as base, expect } from '@playwright/test'
import { mockApi } from './mockApi.js'

// Shared fixture every spec imports instead of @playwright/test directly -
// wires up API mocking plus the brief's own fail-the-test-on conditions
// (console errors, failed requests, uncaught page exceptions) uniformly,
// so no individual spec has to remember to wire these itself.
// Noise that isn't a frontend bug:
// - "Failed to load resource" is the browser's own console echo of any
//   non-2xx response - redundant with (and strictly narrower than) the
//   dedicated response/requestfailed listeners below, which are what
//   actually decide whether a given status was expected (a test
//   deliberately mocking a 401/404 case isn't a bug) - keeping both would
//   double-count the same failure and also flag a test's own intentional
//   error-path mock as if it were unexpected.
// - Google Identity Services logs an origin-mismatch error in ANY dev
//   environment hitting a real client ID from a non-whitelisted origin
//   (localhost:5174 here) - a test-environment artifact of
//   VITE_GOOGLE_CLIENT_ID being configured for production, not a bug in
//   this app's own code.
// WebSocket (STOMP, useGameSocket) isn't mocked - there's no real server to
// connect to here, so it always fails to connect in this environment. Live
// push (match found, broadcasts, ...) is out of scope for these specs;
// every screen falls back to its own REST fetch regardless.
const IGNORED_CONSOLE_PATTERNS = [
  /^Failed to load resource/,
  /GSI_LOGGER/,
  /^WebSocket connection to .* failed/,
]
// Same Google noise, at the network-request layer - a real client id
// pointed at a non-whitelisted origin also aborts/fails its own
// third-party script/button-library loads (sometimes mid-navigation, as a
// genuine ERR_ABORTED), unrelated to anything this app's code does.
const IGNORED_REQUEST_HOSTS = [
  'accounts.google.com',
  'gstatic.com',
  // Real, public, keyless basemap tiles (TerritoryMap.jsx's
  // BASEMAP_STYLE_URL) - not mocked (this is the one piece of the map that
  // actually works over the real network in this environment), so
  // whatever tiles are still in flight when a test ends/the page closes
  // get aborted. The map's own readiness gate (.game-loading-overlay
  // hiding, which specs wait on explicitly) already proves tiles loaded
  // successfully up to that point.
  'tiles.openfreemap.org',
  'apple-id.apple.com',
  'appleid.cdn-apple.com',
]
// Background audio (useGameMusic) - autoplay-blocked in a headless/fresh
// browser profile with no user gesture yet, which the browser reports as
// an aborted request. Not a frontend bug and not API-related.
// Sponsor-banner click pings (api/sponsorPartners.js trackPartnerClick) are
// fetch(..., {redirect: 'manual', keepalive: true}) against the tracked-
// redirect endpoint, which answers 302 - Playwright reports that opaque
// redirect as requestfailed/ERR_ABORTED even though the server counted it.
const IGNORED_REQUEST_PATTERNS = [
  /\/audio\//,
  /\/v1\/partner\/[^/]+\/link\/\d+$/,
]
function isIgnoredRequest(url) {
  if (IGNORED_REQUEST_PATTERNS.some((p) => p.test(url))) return true
  try {
    return IGNORED_REQUEST_HOSTS.some((host) =>
      new URL(url).hostname.endsWith(host)
    )
  } catch {
    return false
  }
}

export const test = base.extend({
  mockedPage: async ({ page }, use) => {
    const consoleErrors = []
    const pageErrors = []
    const failedRequests = []

    page.on('console', (msg) => {
      if (msg.type() !== 'error') return
      const text = msg.text()
      if (IGNORED_CONSOLE_PATTERNS.some((p) => p.test(text))) return
      consoleErrors.push(text)
    })
    page.on('pageerror', (err) => pageErrors.push(err.message))
    page.on('requestfailed', (req) => {
      if (isIgnoredRequest(req.url())) return
      // A reload/navigation cancels in-flight fetches - not a real failure.
      if (req.failure()?.errorText === 'net::ERR_ABORTED') return
      // Our own mock router never fails a request - a real failure here is
      // either a genuinely-missing mock (a bug in the test) or a real bug
      // (an uncaught exception during fetch, a bad URL construction, ...).
      failedRequests.push(
        `${req.method()} ${req.url()} - ${req.failure()?.errorText}`
      )
    })
    page.on('response', (res) => {
      if (isIgnoredRequest(res.url())) return
      if (res.status() >= 500) {
        failedRequests.push(
          `${res.request().method()} ${res.url()} - HTTP ${res.status()}`
        )
      }
    })

    await mockApi(page)

    await use(page)

    expect(consoleErrors, 'console.error calls during the test').toEqual([])
    expect(pageErrors, 'uncaught page exceptions during the test').toEqual([])
    expect(
      failedRequests,
      'failed/5xx network requests during the test'
    ).toEqual([])
  },
})

export { expect }

// Seeds localStorage with a fake session (src/api/client.js's
// TOKEN_KEY/USER_KEY) before the app's first script runs, so a test can
// land straight on /game without actually driving the login form. Must run
// via addInitScript (before navigation), not after - useCurrentUser() reads
// these on mount.
export async function seedSession(page, persona) {
  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('fahhkit_token', token)
      localStorage.setItem('fahhkit_user', JSON.stringify(user))
    },
    { token: 'mock-token', user: persona.user }
  )
}

// No horizontal scroll at the current viewport - one of the brief's own
// blanket fail conditions, reused by every spec that needs it instead of
// each re-deriving the same scrollWidth/clientWidth check.
export async function expectNoHorizontalScroll(page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  )
  expect(
    overflow,
    'document.documentElement.scrollWidth exceeds clientWidth (horizontal scroll)'
  ).toBeLessThanOrEqual(1)
}

// No visible text under 14px - another of the brief's blanket conditions.
// Walks every element with direct text, not every element (a wrapper div
// with only child elements has no "font size" that matters on its own).
// .territory-map-attribution is excluded - MapLibre/OpenFreeMap's required
// attribution line (Leaflet/OpenFreeMap/OpenMapTiles/OpenStreetMap credit),
// legally required small print third-party map providers universally
// render this small, not a readability bug in this app's own UI.
export async function expectNoTinyText(page) {
  const tiny = await page.evaluate(() => {
    const found = []
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT
    )
    let node = walker.currentNode
    while (node) {
      const hasDirectText = Array.from(node.childNodes).some(
        (c) => c.nodeType === Node.TEXT_NODE && c.textContent.trim()
      )
      if (hasDirectText && !node.closest('.territory-map-attribution')) {
        const style = getComputedStyle(node)
        const size = parseFloat(style.fontSize)
        const rect = node.getBoundingClientRect()
        if (
          size < 14 &&
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none'
        ) {
          found.push(
            `${node.tagName.toLowerCase()}.${[...node.classList].join('.')} (${size}px): "${node.textContent.trim().slice(0, 40)}"`
          )
        }
      }
      node = walker.nextNode()
    }
    return found
  })
  expect(tiny, 'visible text rendered under 14px').toEqual([])
}
