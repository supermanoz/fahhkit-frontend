import fs from 'node:fs'
import { test, expect } from './fixtures/base.js'
import {
  ME,
  CHALLENGE_ID,
  RUN_ID,
  challenge,
  mockPvpApi,
  mockStomp,
  scoreResult,
  seedPvpRun,
} from './helpers/pvpRun.js'

// PvP post-run popup (PvpResultPopup): immediate "Calculating", own result
// first, rival later / first / at once, server error, timeout fallback and a
// duplicate resolved event (no double coins). Mocked REST + STOMP.
const OUT = process.env.PVP_SHOTS || ''

async function shot(page, testInfo, name) {
  if (!OUT) return
  fs.mkdirSync(OUT, { recursive: true })
  await page.waitForTimeout(1800) // count-ups finished
  await page.screenshot({ path: `${OUT}/${name}-${testInfo.project.name}.png` })
}

async function boot(page, world) {
  // The race finishes by itself on load; hold the submit until the loading
  // splash (which sits above every popup) is gone.
  let release
  world.holdPost = new Promise((r) => (release = r))
  await mockPvpApi(page, world)
  const stomp = await mockStomp(page)
  await seedPvpRun(page)
  await page.context().grantPermissions(['geolocation'])
  await page.goto('/game')
  await expect(page.locator('.game-hud')).toBeVisible({ timeout: 90_000 })
  await expect.poll(() => stomp.connected(), { timeout: 15_000 }).toBe(true)
  await expect(page.locator('.game-loading-overlay')).toHaveCount(0, {
    timeout: 90_000,
  })
  // The idle nudge can fire during the long load: close it BEFORE the popup
  // (which would sit on top of it) appears.
  await page
    .getByText('Not now')
    .click({ timeout: 1500 })
    .catch(() => {})
  release()
  return stomp
}

const popup = (page) => page.getByTestId('pvp-result')
const WON = () =>
  challenge({
    status: 'COMPLETED',
    winnerId: ME,
    resolutionType: 'WIN_BY_TIME',
    challengerRunId: RUN_ID,
    opponentRunId: 'o1',
  })
const LOST = () =>
  challenge({
    status: 'COMPLETED',
    winnerId: 'rival-1',
    resolutionType: 'WIN_BY_TIME',
    challengerRunId: RUN_ID,
    opponentRunId: 'o1',
  })

test.describe('PvP post-run', () => {
  test.setTimeout(150_000)

  test('own result first, then the rival: calculating -> time -> waiting -> WIN, coins once', async ({
    mockedPage: page,
  }, testInfo) => {
    // Own result is slow to arrive: "Calculating..." shows at once.
    let releaseScore
    const world = {
      balance: 2500,
      holdScore: new Promise((r) => (releaseScore = r)),
    }
    const stomp = await boot(page, world)
    await expect(popup(page)).toHaveAttribute(
      'data-phase',
      /submitting|calculating/,
      {
        timeout: 20_000,
      }
    )
    await expect(popup(page)).toContainText('Calculating')
    await shot(page, testInfo, '1-calculating')
    releaseScore()

    await expect(popup(page)).toHaveAttribute('data-phase', 'waiting', {
      timeout: 30_000,
    })
    await expect(page.getByTestId('pvp-time')).toContainText('5:42')
    await expect(page.getByTestId('pvp-waiting')).toContainText(
      'Waiting for Aarav'
    )
    // Rewards are not blocked on the rival: pot is shown, Done works.
    await expect(page.getByTestId('pvp-coins')).toContainText('200 pot')
    await shot(page, testInfo, '2-waiting-for-opponent')

    // The rival finishes: I win, server says my wallet is 2700.
    world.challenge = WON()
    world.score = scoreResult({
      challengeStatus: 'COMPLETED',
      opponentSubmitted: true,
      opponentRaceTimeSeconds: 371,
      resolutionType: 'WIN_BY_TIME',
      won: true,
    })
    world.balance = 2700
    stomp.push('pvp-challenge-resolved', world.challenge)
    await expect(popup(page)).toHaveAttribute('data-phase', 'final')
    await expect(popup(page)).toHaveAttribute('data-outcome', 'win')
    await expect(popup(page)).toContainText('You won')
    await expect(page.getByTestId('pvp-versus')).toContainText('6:11')
    await expect(page.getByTestId('pvp-coins')).toContainText('2,700', {
      timeout: 8000,
    })
    await expect(page.getByTestId('pvp-coins')).toContainText('+200')
    // today's server sends no points: no points row, no invented numbers
    await expect(page.getByTestId('pvp-points')).toHaveCount(0)
    await shot(page, testInfo, '3-result-win')

    // The same event again (reconnect replay): nothing changes, no 2nd payout.
    const before = await page.getByTestId('pvp-coins').innerText()
    stomp.push('pvp-challenge-resolved', world.challenge)
    await page.waitForTimeout(800)
    expect(await page.getByTestId('pvp-coins').innerText()).toBe(before)
    expect(world.counts.post).toBe(1)

    await page.getByTestId('pvp-done').click()
    await expect(popup(page)).toHaveCount(0)
  })

  test('rival first: the result is final as soon as my own arrives', async ({
    mockedPage: page,
  }, testInfo) => {
    const world = {
      balance: 2500,
      challenge: LOST(),
      score: scoreResult({
        challengeStatus: 'COMPLETED',
        opponentSubmitted: true,
        opponentRaceTimeSeconds: 310,
        resolutionType: 'WIN_BY_TIME',
        won: false,
      }),
    }
    await boot(page, world)
    await expect(popup(page)).toHaveAttribute('data-phase', 'final', {
      timeout: 30_000,
    })
    await expect(popup(page)).toHaveAttribute('data-outcome', 'lose')
    await expect(popup(page)).toContainText('Good race')
    await expect(popup(page)).not.toContainText(/loser|failed|worse/i)
    await shot(page, testInfo, '4-result-loss')
  })

  test('points row appears from server values: win +N, loss -N (red)', async ({
    mockedPage: page,
  }) => {
    const world = {
      balance: 2500,
      challenge: LOST(),
      score: scoreResult({
        challengeStatus: 'COMPLETED',
        opponentSubmitted: true,
        opponentRaceTimeSeconds: 310,
        resolutionType: 'WIN_BY_TIME',
        won: false,
        pointsEarned: -12,
      }),
    }
    await boot(page, world)
    const pts = page.getByTestId('pvp-points')
    await expect(pts).toBeVisible({ timeout: 30_000 })
    await expect(pts).toContainText('POINTS', { ignoreCase: true })
    await expect(pts).toContainText('-12')
    await expect(pts).toContainText('Race lost')
    await expect(pts.locator('.pvp-pr-points')).toHaveClass(/is-down/)
    // between the VS section and the Fahhcoins card
    const order = await page
      .locator(
        '[data-testid="pvp-versus"], [data-testid="pvp-points"], [data-testid="pvp-coins"]'
      )
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
    expect(order).toEqual(['pvp-versus', 'pvp-points', 'pvp-coins'])
    const box = await page.getByTestId('pvp-points').boundingBox()
    const vp = page.viewportSize()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width)
  })

  test('winner sees +N with the Win/Race breakdown; zero is muted', async ({
    mockedPage: page,
  }) => {
    const world = {
      balance: 2700,
      challenge: WON(),
      score: scoreResult({
        challengeStatus: 'COMPLETED',
        opponentSubmitted: true,
        opponentRaceTimeSeconds: 371,
        resolutionType: 'WIN_BY_TIME',
        won: true,
        pointsEarned: 30,
        pointsWin: 25,
        pointsRace: 5,
      }),
    }
    await boot(page, world)
    const pts = page.getByTestId('pvp-points')
    await expect(pts).toContainText('+30', { timeout: 30_000 })
    await expect(pts).toContainText('Win: +25 / Race: +5')
    await expect(pts.locator('.pvp-pr-points')).toHaveClass(/is-up/)
  })

  test('both at once (draw): stakes refunded', async ({
    mockedPage: page,
  }, testInfo) => {
    const world = {
      balance: 2500,
      challenge: challenge({
        status: 'COMPLETED',
        resolutionType: 'TIE_REFUND',
        challengerRunId: RUN_ID,
        opponentRunId: 'o1',
      }),
      score: scoreResult({
        challengeStatus: 'COMPLETED',
        opponentSubmitted: true,
        opponentRaceTimeSeconds: 342,
        resolutionType: 'TIE_REFUND',
        won: null,
      }),
    }
    await boot(page, world)
    await expect(popup(page)).toHaveAttribute('data-outcome', 'draw', {
      timeout: 30_000,
    })
    await expect(popup(page)).toContainText('tie')
    await shot(page, testInfo, '5-result-draw')
  })

  test('server error: message, Try again sends the SAME run (no duplicate)', async ({
    mockedPage: page,
  }, testInfo) => {
    page.allowFailedRequests = true
    const world = { runPost: 500 }
    await boot(page, world)
    await expect(popup(page)).toHaveAttribute('data-phase', 'error', {
      timeout: 30_000,
    })
    await expect(popup(page)).toContainText('safe on this phone')
    await shot(page, testInfo, '6-error')
    world.runPost = 'ok'
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(popup(page)).toHaveAttribute('data-phase', /waiting|final/, {
      timeout: 20_000,
    })
  })

  test('timeout fallback: own result not ready -> "Still processing", never a bare spinner', async ({
    mockedPage: page,
  }, testInfo) => {
    const world = {
      score: { runId: RUN_ID, mode: 'PVP', status: 'PROCESSING' },
    }
    await boot(page, world)
    await expect(page.getByTestId('pvp-delayed')).toBeVisible({
      timeout: 40_000,
    })
    await expect(page.getByTestId('pvp-delayed')).toContainText(
      'Still processing'
    )
    await shot(page, testInfo, '7-still-processing')
    await page.getByTestId('pvp-done').click()
    await expect(popup(page)).toHaveCount(0)
    // Done does not lose the race: when it lands the popup comes back.
    world.score = scoreResult()
    expect(CHALLENGE_ID).toBe('c1')
  })
})
