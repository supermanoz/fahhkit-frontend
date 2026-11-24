import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Daily reward popup (hooks/useDailyReward.js, components/DailyRewardModal.jsx).
// The server is mocked: claimable -> popup -> Claim -> claimed state with a
// countdown; not claimable -> no popup. Screenshots in ./screenshots/daily-reward/.
const REWARDS = [
  { day: 1, coins: 5, xp: 0, item: null },
  { day: 2, coins: 10, xp: 0, item: null },
  { day: 3, coins: 15, xp: 50, item: null },
  { day: 4, coins: 20, xp: 0, item: null },
  { day: 5, coins: 25, xp: 100, item: null },
  { day: 6, coins: 30, xp: 0, item: null },
  { day: 7, coins: 100, xp: 250, item: { id: 41, name: 'Golden Trail' } },
]
const TOMORROW = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString()

function status(claimable) {
  return {
    claimable,
    nextClaimAt: claimable ? null : TOMORROW(),
    streak: 3,
    todayIndex: 4,
    rewards: REWARDS,
    serverTime: new Date().toISOString(),
  }
}

async function openGame(page, context) {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  await seedSession(page, VETERAN)
  await page.goto('/game')
  // The menu button only exists once the game is ready (toBeHidden alone
  // passes before the loading overlay has even mounted).
  await expect(page.locator('.game-menu-btn')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 30_000,
  })
}

test.describe('Daily reward', () => {
  test('claimable: popup shows, claim flips the tile and starts the countdown', async ({
    mockedPage: page,
    context,
  }, testInfo) => {
    let claims = 0
    let claimed = false
    await page.route('**/v1/daily-login/status', (route) =>
      route.fulfill(ok(status(!claimed)))
    )
    await page.route('**/v1/daily-login/claim', (route) => {
      claims += 1
      claimed = true
      route.fulfill(
        ok({
          granted: REWARDS[3],
          streak: 4,
          todayIndex: 4,
          balance: VETERAN.territoryProfile.fahhcoinBalance + 20,
          nextClaimAt: TOMORROW(),
          serverTime: new Date().toISOString(),
        })
      )
    })
    await openGame(page, context)

    const modal = page.getByTestId('daily-reward-modal')
    await expect(modal).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('daily-streak')).toContainText('3-day streak')
    await expect(page.getByTestId('daily-tile-4')).toHaveAttribute(
      'data-state',
      'today'
    )
    await expect(page.getByTestId('daily-tile-2')).toHaveAttribute(
      'data-state',
      'claimed'
    )
    await expect(page.getByTestId('daily-tile-7')).toHaveAttribute(
      'data-state',
      'locked'
    )
    await page.screenshot({
      path: `screenshots/daily-reward/${testInfo.project.name}-claimable.png`,
    })

    // Opening/seeing the popup never changes the balance.
    const start = VETERAN.territoryProfile.fahhcoinBalance
    const pill = page.getByTestId('daily-balance')
    await expect(pill).toHaveText(start.toLocaleString('en-US'))
    expect(claims).toBe(0)

    const claim = modal.getByRole('button', { name: 'Claim' })
    await claim.dblclick() // double tap must not double-claim
    await expect(page.getByTestId('daily-granted')).toBeVisible()
    // Tap anywhere to skip the celebration: the server's balance lands at once.
    await modal.click({ position: { x: 20, y: 120 } })
    await expect(pill).toHaveText((start + 20).toLocaleString('en-US'))
    await expect(page.getByTestId('daily-tile-4')).toHaveAttribute(
      'data-state',
      'claimed'
    )
    await expect(page.getByTestId('daily-countdown')).toHaveText(
      /^23:5\d:\d\d$/
    )
    expect(claims).toBe(1)
    await page.screenshot({
      path: `screenshots/daily-reward/${testInfo.project.name}-claimed.png`,
    })

    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(modal).toBeHidden()
  })

  test('failed claim grants nothing, shows a message and re-syncs status', async ({
    mockedPage: page,
    context,
  }) => {
    let statusCalls = 0
    await page.route('**/v1/daily-login/status', (route) => {
      statusCalls += 1
      route.fulfill(ok(status(true)))
    })
    await page.route('**/v1/daily-login/claim', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ status: 500, message: 'Server exploded' }),
      })
    )
    await openGame(page, context)
    const modal = page.getByTestId('daily-reward-modal')
    await expect(modal).toBeVisible({ timeout: 30_000 })
    const start = VETERAN.territoryProfile.fahhcoinBalance
    const before = statusCalls
    await modal.getByRole('button', { name: 'Claim' }).click()
    await expect(page.getByTestId('daily-error')).toBeVisible()
    await expect(page.getByTestId('daily-granted')).toHaveCount(0)
    await expect(page.getByTestId('daily-balance')).toHaveText(
      start.toLocaleString('en-US')
    )
    await expect.poll(() => statusCalls).toBeGreaterThan(before)
    // still claimable: the button is back for a retry
    await expect(modal.getByRole('button', { name: 'Try again' })).toBeEnabled()
  })

  test('dismissed while claimable leaves a dot on the menu button', async ({
    mockedPage: page,
    context,
  }) => {
    await page.route('**/v1/daily-login/status', (route) =>
      route.fulfill(ok(status(true)))
    )
    await openGame(page, context)
    await expect(page.getByTestId('daily-reward-modal')).toBeVisible({
      timeout: 30_000,
    })
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByTestId('daily-reward-dot')).toBeVisible()
  })

  test('not claimable: no popup, no dot', async ({
    mockedPage: page,
    context,
  }) => {
    await page.route('**/v1/daily-login/status', (route) =>
      route.fulfill(ok(status(false)))
    )
    await openGame(page, context)
    await expect(page.getByTestId('daily-reward-modal')).toHaveCount(0)
    await expect(page.getByTestId('daily-reward-dot')).toHaveCount(0)
  })
})
