// Mocks the backend over page.route() - the real one isn't reachable in
// this environment (or most dev boxes without a local Spring Boot instance
// running), and every success envelope the frontend unwraps is
// {status, data} (see src/api/client.js's parseResponse / GeneralResponse
// on the backend, checked directly) - `ok(payload)` below wraps a mock the
// same way.
//
// Routing: exact-path overrides (`routes`) win; anything else matching
// /v1/** falls through to a generic "empty but valid" shape keyed off the
// HTTP method, so a page that calls some endpoint this fixture doesn't
// specifically care about still gets a 200 instead of hanging on a real
// network request that will never resolve. GET defaults to `null`,
// POST/PUT to `[]` (covers every ...find/list endpoint's typical shape)
// unless the path ends in a plural noun pattern Vue... (none here) - tests
// that need a real shape for some endpoint add it to `routes`.
import { VETERAN, STORE_CATALOG } from '../mocks/personas.js'

function ok(data) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: 200, data }),
  }
}

const DEFAULT_ROUTES = () => ({
  'POST /v1/authenticate': ok({ tokenId: 'mock-token' }),
  'GET /v1/user/find/logged-in': ok(VETERAN.user),
  'GET /v1/territory/profile': ok(VETERAN.territoryProfile),
  'POST /v1/store/catalog/find': ok({
    content: STORE_CATALOG,
    totalElements: STORE_CATALOG.length,
  }),
  'GET /v1/store/owned': ok(VETERAN.ownedItems),
  'GET /v1/store/equipped': ok(VETERAN.ownedItems.filter((o) => o.equipped)),
  'POST /v1/leaderboard/individual/find': ok({ content: [], totalElements: 0 }),
  'POST /v1/leaderboard/club/find': ok({ content: [], totalElements: 0 }),
  'GET /v1/club/my': ok(null),
  'POST /v1/territory/parcel/find': ok({ content: [], totalElements: 0 }),
  'GET /v1/territory/parcel/near': ok([]),
  'POST /v1/territory-rollout/city/list': ok({ content: [], totalElements: 0 }),
  'GET /v1/partner/current': ok(null),
})

// Installs the mock router on `page`. `overrides` is a map of
// 'METHOD /path' -> a Playwright fulfill() object (use `ok(data)` or a
// custom {status, body} for an error case) that wins over both the
// per-call default and the generic catch-all.
export async function mockApi(page, overrides = {}) {
  const routes = { ...DEFAULT_ROUTES(), ...overrides }
  await page.route('**/v1/**', (route) => {
    const req = route.request()
    const url = new URL(req.url())
    // Match on the path from /v1 on, so a base-URL path prefix (prod's
    // https://cafebizarre.com.np/fahhkit/v1/...) hits the same overrides as dev.
    const key = `${req.method()} ${url.pathname.replace(/^.*?(\/v1\/)/, '$1')}`
    if (routes[key]) return route.fulfill(routes[key])
    // Generic catch-all - logged so a real gap shows up in the test output
    // without failing every other test that doesn't care about it.
    console.log(`[mockApi] unmatched ${key} -> generic empty response`)
    return route.fulfill(
      ok(req.method() === 'GET' ? null : { content: [], totalElements: 0 })
    )
  })
}

export { ok }
