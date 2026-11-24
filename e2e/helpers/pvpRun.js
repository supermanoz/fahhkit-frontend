import { ok } from '../fixtures/mockApi.js'
import { seedSession } from '../fixtures/base.js'
import { VETERAN } from '../mocks/personas.js'

// Shared mocks for the PvP post-run specs: a seeded 1 km race run that is ready
// to end, the REST endpoints it touches, and a minimal STOMP broker so a test
// can push `/specific/{me}/pvp-challenge-resolved` etc. like the real server.
export const ME = VETERAN.user.id
export const RUN_ID = 'run-77'
export const CHALLENGE_ID = 'c1'

export const challenge = (over = {}) => ({
  id: CHALLENGE_ID,
  challengerId: ME,
  challengerName: 'Veteran Runner',
  opponentId: 'rival-1',
  opponentName: 'Aarav Sharma',
  distanceMeters: 1000,
  stakeAmount: 100,
  source: 'DIRECT',
  status: 'IN_PROGRESS',
  challengerConfirmed: true,
  opponentConfirmed: true,
  challengerRunId: null,
  opponentRunId: null,
  winnerId: null,
  resolutionType: null,
  expiresAt: new Date(Date.now() + 2 * 3600_000).toISOString(),
  ...over,
})

// Server-side PvP result for MY run (GET /v1/run/{id}/score-breakdown).
export const scoreResult = (pvp = {}) => ({
  runId: RUN_ID,
  mode: 'PVP',
  status: 'READY',
  pvpResult: {
    challengeId: CHALLENGE_ID,
    challengeStatus: 'IN_PROGRESS',
    distanceMeters: 1000,
    runValid: true,
    raceTimeSeconds: 342,
    opponentRaceTimeSeconds: null,
    opponentSubmitted: false,
    resolutionType: null,
    won: null,
    ...pvp,
  },
})

// A race-ready active run: 1 km, 15 min, tagged with the challenge.
export async function seedPvpRun(page) {
  await page.addInitScript(
    ({ id }) => {
      if (sessionStorage.getItem('__seeded')) return
      sessionStorage.setItem('__seeded', '1')
      const now = Date.now()
      const n = 30
      const points = Array.from({ length: n }, (_, i) => ({
        lat: 27.7172 + (i / n) * 0.009,
        lng: 85.324,
        timestamp: now - 900000 + i * 30000,
        accuracy: 5,
      }))
      localStorage.setItem(
        'fahhkit_active_run',
        JSON.stringify({
          startedAt: new Date(now - 900000).toISOString(),
          eventId: null,
          challengeId: id,
          clubWarId: null,
          isTraining: false,
          points,
          distance: 1000,
          paused: false,
          pausedMs: 0,
          clientRunId: 'run-e2e-pvp-1',
        })
      )
      navigator.geolocation.getCurrentPosition = (cb) =>
        cb({
          coords: { latitude: 27.7172, longitude: 85.324, accuracy: 5 },
          timestamp: Date.now(),
        })
      navigator.geolocation.watchPosition = (cb) => {
        setTimeout(
          () =>
            cb({
              coords: {
                latitude: 27.7172,
                longitude: 85.324,
                accuracy: 5,
                speed: 0,
              },
              timestamp: Date.now(),
            }),
          50
        )
        return 1
      }
      navigator.geolocation.clearWatch = () => {}
    },
    { id: CHALLENGE_ID }
  )
}

const frame = (cmd, headers, body = '') =>
  `${cmd}\n${Object.entries(headers)
    .map(([k, v]) => `${k}:${v}`)
    .join('\n')}\n\n${body}\0`

// Minimal STOMP broker. push(sub, payload) sends to /specific/{ME}/{sub} (or
// pass a full destination starting with "/").
export async function mockStomp(page) {
  const state = { socket: null, subs: {}, sent: 0 }
  await page.routeWebSocket(/\/ws$/, (ws) => {
    state.socket = ws
    ws.onMessage((raw) => {
      const text = String(raw)
      if (text.startsWith('CONNECT') || text.startsWith('STOMP')) {
        ws.send(frame('CONNECTED', { version: '1.2', 'heart-beat': '0,0' }))
      } else if (text.startsWith('SUBSCRIBE')) {
        const id = /\nid:([^\n]+)/.exec(text)?.[1]
        const dest = /\ndestination:([^\n]+)/.exec(text)?.[1]
        if (dest) state.subs[dest] = id
      }
    })
  })
  state.connected = () => Object.keys(state.subs).length > 0
  state.push = (dest, payload) => {
    const destination = dest.startsWith('/') ? dest : `/specific/${ME}/${dest}`
    state.socket.send(
      frame(
        'MESSAGE',
        {
          destination,
          subscription: state.subs[destination],
          'message-id': String(++state.sent),
          'content-type': 'application/json',
        },
        JSON.stringify(payload)
      )
    )
  }
  return state
}

// REST mocks. `world` is mutable so a test changes what the server answers:
//   world.challenge, world.score (score-breakdown body), world.balance,
//   world.runPost ('ok' | 500 | 'slow'), world.counts.{post,score,challenge}
export async function mockPvpApi(page, world) {
  world.counts = { post: 0, score: 0, challenge: 0 }
  world.balance ??= 2500
  world.challenge ??= challenge()
  world.score ??= scoreResult()
  await seedSession(page, VETERAN)
  await page.route('**/v1/territory/profile', (r) =>
    r.fulfill(
      ok({ ...VETERAN.territoryProfile, fahhcoinBalance: world.balance })
    )
  )
  // The rival's public profile (their equipped hero is read from it).
  await page.route('**/v1/territory/profile/rival-1', (r) =>
    r.fulfill(ok({ userId: 'rival-1', level: 9, equippedCosmetics: [] }))
  )
  await page.route('**/v1/run-challenge/find', (r) =>
    r.fulfill(ok({ content: [world.challenge], totalElements: 1 }))
  )
  await page.route(`**/v1/run-challenge/${CHALLENGE_ID}`, (r) => {
    world.counts.challenge += 1
    return r.fulfill(ok(world.challenge))
  })
  await page.route('**/v1/pvp/queue/status', (r) => r.fulfill(ok(null)))
  await page.route('**/v1/run', async (r) => {
    if (r.request().method() !== 'POST') return r.fallback()
    world.counts.post += 1
    // held until the game's loading splash is gone (see boot in the specs)
    if (world.holdPost) await world.holdPost
    if (world.runPost === 'slow') await new Promise((x) => setTimeout(x, 4000))
    if (world.runPost === 500)
      return r.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ errorMessage: 'Server hiccup' }),
      })
    return r.fulfill(ok({ id: RUN_ID, avgPace: 5.7 }))
  })
  await page.route(`**/v1/run/${RUN_ID}/score-breakdown`, async (r) => {
    world.counts.score += 1
    if (world.holdScore) await world.holdScore
    return r.fulfill(ok(world.score))
  })
  await page.addLocatorHandler(page.locator('.idle-nudge-backdrop'), () =>
    page.getByText('Not now').click()
  )
}
