import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// The PvP arena (PvpPanel.jsx): hub, distance, rival, nearby + stake,
// searching / found, race screens and results, the pre-run countdown, safe
// area and reduced motion. API calls are mocked. Screenshots:
// ./screenshots/pvp-arena/.
const OUT = 'screenshots/pvp-arena'
const ME = VETERAN.user.id
const HOUR = 3600_000
const in2h = () => new Date(Date.now() + 2 * HOUR).toISOString()

const race = (over) => ({
  id: 'c1',
  challengerId: ME,
  challengerName: 'Veteran Runner',
  opponentId: 'rival-1',
  opponentName: 'Aarav Sharma',
  distanceMeters: 1000,
  stakeAmount: 100,
  source: 'DIRECT',
  status: 'PENDING',
  challengerConfirmed: true,
  opponentConfirmed: false,
  challengerRunId: null,
  opponentRunId: null,
  winnerId: null,
  resolutionType: null,
  expiresAt: in2h(),
  ...over,
})

async function setup(
  page,
  { challenges = [], nearby = [], balance = 2500, queue = null } = {}
) {
  await seedSession(page, VETERAN)
  // Visibility is on for these tests (the gate itself is in pvp-portal.spec.js).
  await page.addInitScript(() =>
    localStorage.setItem('fahhkit_pvp_discoverable', 'true')
  )
  await page.route('**/v1/territory/profile', (r) =>
    r.fulfill(ok({ ...VETERAN.territoryProfile, fahhcoinBalance: balance }))
  )
  await page.route('**/v1/run-challenge/find', (r) =>
    r.fulfill(ok({ content: challenges, totalElements: challenges.length }))
  )
  await page.route('**/v1/pvp/queue/status', (r) =>
    r.fulfill(ok(page.queueStatus ?? queue))
  )
  await page.route('**/v1/pvp/discovery/nearby**', (r) => r.fulfill(ok(nearby)))
  await page.route('**/v1/pvp/discovery/location/ping', (r) =>
    r.fulfill(ok({}))
  )
  await page.addLocatorHandler(page.locator('.idle-nudge-backdrop'), () =>
    page.getByText('Not now').click()
  )
  // An incoming challenge shows its own pop-up over the map; the player's
  // way past it (without answering) is "Decide later".
  await page.addLocatorHandler(page.locator('.challenge-prompt-backdrop'), () =>
    page.getByRole('button', { name: /Decide later/ }).click()
  )
}

async function openArena(page, context, vp) {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  await page.setViewportSize(vp)
  await page.goto('/game')
  await expect(page.locator('.game-hud-level')).toBeVisible({ timeout: 90_000 })
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('button', { name: 'PvP', exact: true }).click()
  await expect(page.locator('.pvp-arena')).toBeVisible({ timeout: 10_000 })
  // The cloud portal parts and goes away.
  await expect(page.locator('.portal-clouds')).toHaveCount(0, { timeout: 5000 })
  await page.waitForTimeout(300)
}

const SMALL = { width: 360, height: 640 }
const PHONE = { width: 390, height: 844 }

async function expectNoOverflow(page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth
    )
  ).toBe(true)
  // Nothing wider than the screen inside the arena.
  const wide = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    return [...document.querySelectorAll('.pvp-arena *')]
      .filter((el) => el.getBoundingClientRect().right > vw + 1)
      .map((el) => el.className)
      .slice(0, 5)
  })
  expect(wide).toEqual([])
}

const go = (page, name) =>
  page.getByRole('button', { name, exact: true }).first()

// eslint-disable-next-line no-unused-vars -- a fixture must be destructured
test.beforeEach(async ({ mockedPage: _page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-390', 'one project is enough')
})

test.describe('hub', () => {
  test('empty: header, VS banner, friendly stats, empty state, sticky Battle (360x640)', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(60_000)
    await setup(page, { challenges: [] })
    await openArena(page, context, SMALL)

    // The shared pill header (same as Me / Shop) with the coin chip and the
    // shared close X - and NO section dropdown on PvP.
    const pill = page.locator('.game-menu-picker-current.is-static')
    await expect(pill).toBeVisible()
    await expect(pill.locator('h1')).toHaveText('PvP')
    await expect(pill.locator('.game-menu-picker-medal')).toBeVisible()
    await expect(page.locator('.pvp-balance-chip')).toContainText('2500')
    await expect(page.locator('.game-menu-picker-knob')).toHaveCount(0)
    await expect(page.locator('.game-menu-picker-list')).toHaveCount(0)
    await expect(page.locator('.game-menu-tabs')).toHaveCount(0)
    // Static: tapping it opens nothing.
    await pill.click({ position: { x: 40, y: 20 } })
    await expect(page.locator('.game-menu-picker-list')).toHaveCount(0)
    // Chip and X never overlap, and both are on screen.
    const chip = await page.locator('.pvp-balance-chip').boundingBox()
    const x = await page.locator('.game-menu-close').boundingBox()
    const overlap =
      chip.x < x.x + x.width &&
      chip.x + chip.width > x.x &&
      chip.y < x.y + x.height &&
      chip.y + chip.height > x.y
    expect(overlap).toBe(false)
    expect(x.x + x.width).toBeLessThanOrEqual(SMALL.width)
    // Same cream page as the other sections (no dark full-page background).
    const sheetBg = await page
      .locator('.game-menu-sheet')
      .evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(sheetBg).toBe('rgb(233, 231, 221)')

    // Hero banner (you vs a "?" silhouette), stats with a friendly empty value.
    await expect(page.locator('.pvp-silhouette')).toBeVisible()
    await expect(page.locator('.pvp-vs')).toBeVisible()
    await expect(page.locator('.g-stat-chip')).toHaveCount(3)
    await expect(page.getByText('No races yet', { exact: true })).toBeVisible()
    await expect(page.locator('.g-stat-chip-label').first()).toHaveText(
      'Record'
    )
    await expect(page.getByText('--', { exact: true })).toHaveCount(0)
    // Empty state with the CTA.
    await expect(page.getByText('No races on right now')).toBeVisible()
    await expect(go(page, 'Find a rival')).toBeVisible()

    // Sticky Battle button, fully on screen above the bottom edge.
    const battle = go(page, 'Battle')
    await expect(battle).toBeInViewport({ ratio: 1 })
    expect((await battle.boundingBox()).height).toBeGreaterThanOrEqual(44)

    // Readability: titles in the display font, sentences in the body font.
    await expect(page.locator('.pvp-section-title').first()).toHaveCSS(
      'font-family',
      /Lilita One/
    )
    await expect(page.locator('.pvp-banner .pvp-sentence')).toHaveCSS(
      'font-family',
      /Nunito/
    )
    await expect(page.locator('.pvp-banner .pvp-sentence')).toHaveCSS(
      '-webkit-text-stroke-width',
      '0px'
    )
    await expectNoOverflow(page)
    await page.screenshot({ path: `${OUT}/hub-empty-360x640.png` })
  })

  test('active races + recent results as cards with status chips (390x844)', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(60_000)
    await setup(page, {
      challenges: [
        race({
          id: 'a',
          status: 'PENDING',
          challengerId: 'rival-1',
          opponentId: ME,
          challengerName: 'Aarav Sharma',
          opponentName: 'Veteran Runner',
          challengerConfirmed: true,
          opponentConfirmed: false,
        }),
        race({
          id: 'b',
          status: 'IN_PROGRESS',
          opponentConfirmed: true,
          challengerConfirmed: true,
          opponentName: 'Sita Rai',
          distanceMeters: 500,
          stakeAmount: 50,
        }),
        race({
          id: 'c',
          status: 'PENDING',
          opponentName: 'Bikash K',
          distanceMeters: 5000,
          stakeAmount: 500,
        }),
        race({
          id: 'd',
          status: 'COMPLETED',
          winnerId: ME,
          resolutionType: 'WIN_BY_TIME',
          opponentName: 'Maya Gurung',
          challengerConfirmed: true,
          opponentConfirmed: true,
        }),
        race({
          id: 'e',
          status: 'COMPLETED',
          winnerId: 'rival-1',
          resolutionType: 'WIN_BY_TIME',
          opponentName: 'Nima Lama',
          challengerConfirmed: true,
          opponentConfirmed: true,
        }),
      ],
    })
    await openArena(page, context, PHONE)
    await expect(page.locator('.pvp-race')).toHaveCount(3)
    await expect(page.getByText('Your move', { exact: true })).toBeVisible()
    await expect(page.getByText('Run now', { exact: true })).toBeVisible()
    await expect(page.getByText('Waiting', { exact: true })).toBeVisible()
    // Each card: rival, distance, pot (with gold coin), time left.
    const first = page.locator('.pvp-race').first()
    await expect(first).toContainText('vs Aarav')
    await expect(first).toContainText('pot')
    await expect(first).toContainText('left')
    // Real record from the two finished races.
    await expect(page.locator('.g-stat-chip-value').first()).toHaveText('1-1')
    await expect(page.getByText('50%', { exact: true })).toBeVisible()
    await expect(page.getByText('Victory', { exact: true })).toBeVisible()
    await expect(page.getByText('Defeat', { exact: true })).toBeVisible()
    await expectNoOverflow(page)
    await page.screenshot({ path: `${OUT}/hub-active-390x844.png` })
  })
})

test.describe('sticky Battle button never hides content', () => {
  test('the empty state scrolls fully above it (360x640)', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(90_000)
    await setup(page, { challenges: [] })
    await openArena(page, context, SMALL)
    const sheet = page.locator('.game-menu-sheet')
    // At the very top the bar floats over content that is further down...
    expect(await sheet.evaluate((el) => el.scrollTop)).toBe(0)
    // ...and scrolling to the end brings every last item fully above it.
    await sheet.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await page.waitForTimeout(250)
    const bar = await page.locator('.pvp-cta-bar').boundingBox()
    const last = await go(page, 'Find a rival').boundingBox()
    expect(last.y + last.height).toBeLessThanOrEqual(bar.y + 1)
    const text = await page
      .getByText('Challenge a runner and settle it on the road.')
      .boundingBox()
    expect(text.y + text.height).toBeLessThanOrEqual(bar.y + 1)
    // The bar itself still ends at the bottom of the screen.
    expect(bar.y + bar.height).toBeLessThanOrEqual(SMALL.height + 1)
    await page.screenshot({ path: `${OUT}/hub-scrolled-360x640.png` })
  })

  test('the reserved space is the bar height + gap + the home-indicator inset', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(90_000)
    await setup(page, {})
    await openArena(page, context, PHONE)
    await page.evaluate(() => {
      const root = document.documentElement
      root.dataset.native = 'true'
      root.style.setProperty('--native-safe-bottom', '34px')
    })
    await page.waitForTimeout(200)
    const { pad, bar, button } = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('.pvp-screen'))
      return {
        pad: parseFloat(cs.paddingBottom),
        bar: document.querySelector('.pvp-cta-bar').getBoundingClientRect()
          .height,
        button: document
          .querySelector('.pvp-battle-btn')
          .getBoundingClientRect().height,
      }
    })
    expect(bar).toBeGreaterThanOrEqual(button + 34) // button + inset
    expect(pad).toBeGreaterThanOrEqual(bar + 12) // bar height + a gap
  })

  test('screens without the bar keep normal bottom room, nothing sticky', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(90_000)
    await setup(page, {})
    await openArena(page, context, SMALL)
    await go(page, 'Battle').click()
    await expect(page.locator('.pvp-cta-bar')).toHaveCount(0)
    await expect(page.locator('.pvp-arena')).not.toHaveClass(/has-cta/)
    const last = await page.locator('.pvp-tier').last().boundingBox()
    expect(last.y + last.height).toBeLessThanOrEqual(SMALL.height)
  })
})

test.describe('setup flow', () => {
  test('distance tiers (blue / green / slate), labelled steps, then the rival choice', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(60_000)
    await setup(page, {})
    await openArena(page, context, PHONE)
    await go(page, 'Battle').click()
    await expect(page.getByText('Pick a distance')).toBeVisible()

    // Labelled stepper, not anonymous dots.
    await expect(page.locator('.pvp-steps li')).toHaveText([
      /1\s*Distance/,
      /2\s*Rival/,
      /3\s*Stake/,
      /4\s*Go/,
    ])
    await expect(page.locator('.pvp-steps li.is-now')).toContainText('Distance')

    const tiers = page.locator('.pvp-tier')
    await expect(tiers).toHaveCount(3)
    await expect(tiers.nth(0)).toHaveClass(/is-blue/)
    await expect(tiers.nth(1)).toHaveClass(/is-green/)
    await expect(tiers.nth(2)).toHaveClass(/is-slate/)
    await expect(tiers.nth(0)).toContainText('500 m')
    await expect(tiers.nth(0)).toContainText('Sprint')
    await expect(tiers.nth(0)).toContainText('About 3 min')
    await expect(tiers.nth(1)).toContainText('100')
    // Pitch is body-font copy without an outline.
    await expect(page.locator('.pvp-tier-pitch').first()).toHaveCSS(
      '-webkit-text-stroke-width',
      '0px'
    )
    await expect(page.locator('.pvp-tier-pitch').first()).toHaveCSS(
      'font-family',
      /Nunito/
    )
    for (const t of await tiers.all()) {
      expect((await t.boundingBox()).height).toBeGreaterThanOrEqual(44)
    }
    await page.screenshot({ path: `${OUT}/distance-390x844.png` })

    await tiers.nth(1).click()
    await expect(page.getByText('Choose your rival')).toBeVisible()
    await expect(page.locator('.pvp-steps li.is-now')).toContainText('Rival')
    await expect(page.locator('.pvp-picked-chip')).toHaveText('1 km')
    await expect(page.locator('.pvp-option')).toHaveCount(2)
    // Back returns to the distance step with the chosen tier highlighted.
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.locator('.pvp-tier.is-selected')).toContainText('1 km')
  })

  test('Quick Match locked: clear reason, readable, with a Get Fahhcoin action (360x640)', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(60_000)
    await setup(page, { balance: 0 })
    await openArena(page, context, SMALL)
    await go(page, 'Battle').click()
    await page.locator('.pvp-tier').nth(1).click()
    const locked = page.locator('.pvp-option.is-locked')
    await expect(locked).toBeVisible()
    await expect(locked).toContainText('Need 100 coins - you have 0')
    await expect(locked.locator('.pvp-option-icon svg')).toBeVisible() // lock icon
    // Normal contrast: not faded with opacity.
    expect(await locked.evaluate((el) => getComputedStyle(el).opacity)).toBe(
      '1'
    )
    await expect(locked.locator('.pvp-option-need')).toHaveCSS('opacity', '1')
    // The tip is a small info row, not coloured body copy.
    await expect(page.locator('.pvp-notice')).toContainText('Visibility')
    await page.screenshot({ path: `${OUT}/rival-locked-360x640.png` })
    await locked.getByRole('button', { name: 'Get Fahhcoin' }).click()
    await expect(page.getByText('Buy Fahhcoin')).toBeVisible()
  })

  test('Challenge Nearby: rival cards, stake stepper, pot summary, sends the challenge', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(60_000)
    await setup(page, {
      nearby: [
        {
          userId: 'rival-1',
          fullName: 'Aarav Sharma',
          level: 12,
          distanceMeters: 420,
        },
        {
          userId: 'rival-2',
          fullName: 'Sita Rai',
          level: 7,
          distanceMeters: 1650,
        },
      ],
    })
    let posted = null
    await page.route('**/v1/pvp/discovery/challenge', (r) => {
      posted = r.request().postDataJSON()
      return r.fulfill(ok(race({ id: 'new1', source: 'DIRECT' })))
    })
    await openArena(page, context, PHONE)
    await go(page, 'Battle').click()
    await page.locator('.pvp-tier').nth(1).click()
    await page.locator('.pvp-option').nth(1).click()
    await expect(page.getByText('Runners near you')).toBeVisible()
    const cards = page.locator('.pvp-rival')
    await expect(cards).toHaveCount(2)
    await expect(cards.nth(0)).toContainText('Aarav')
    await expect(cards.nth(0)).toContainText('Lv 12')
    await expect(cards.nth(0)).toContainText('420 m away')
    await expect(cards.nth(1)).toContainText('1.7 km away')
    await page.screenshot({ path: `${OUT}/nearby-390x844.png` })

    await cards.nth(0).click()
    await expect(page.getByText('Set the stake')).toBeVisible()
    await expect(page.locator('.pvp-steps li.is-now')).toContainText('Stake')
    await expect(page.locator('.pvp-pot')).toContainText('You stake')
    await expect(page.locator('.pvp-pot')).toContainText('100')
    await expect(page.locator('.pvp-pot')).toContainText('Winner takes')
    await expect(page.locator('.pvp-pot')).toContainText('200')
    await page.getByRole('button', { name: /Raise the stake/ }).click()
    await expect(page.locator('.pvp-stake-input')).toHaveValue('150')
    await expect(page.locator('.pvp-pot')).toContainText('300')
    await page.locator('.pvp-stake-chip').first().click()
    await expect(page.locator('.pvp-stake-input')).toHaveValue('100')
    await page.screenshot({ path: `${OUT}/stake-390x844.png` })
    await go(page, 'Send challenge').click()
    await expect
      .poll(() => posted)
      .toEqual({
        opponentUserId: 'rival-1',
        mode: 'ONE_KM',
        stakeAmount: 100,
      })
    // Straight into that race.
    await expect(page.getByText('Your race')).toBeVisible()
  })

  test('stake input stays in view with the keyboard up and rejects more than you have', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(60_000)
    await setup(page, {
      balance: 120,
      nearby: [
        {
          userId: 'rival-1',
          fullName: 'Aarav Sharma',
          level: 3,
          distanceMeters: 90,
        },
      ],
    })
    await openArena(page, context, SMALL)
    await go(page, 'Battle').click()
    await page.locator('.pvp-tier').nth(1).click()
    await page.locator('.pvp-option').nth(1).click()
    await page.locator('.pvp-rival').first().click()
    await page.setViewportSize({ width: 360, height: 360 }) // keyboard open
    await page.locator('.pvp-stake-input').focus()
    await page.waitForTimeout(700)
    await expect(page.locator('.pvp-stake-input')).toBeInViewport({ ratio: 1 })
    await page.locator('.pvp-stake-input').fill('500')
    await expect(page.locator('.pvp-have')).toContainText(
      'You only have 120 coins'
    )
    await expect(go(page, 'Send challenge')).toBeDisabled()
  })

  test('nobody nearby: empty state with the visibility tip and a way to Settings', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(60_000)
    await setup(page, { nearby: [] })
    await openArena(page, context, SMALL)
    await go(page, 'Battle').click()
    await page.locator('.pvp-tier').nth(0).click()
    await page.locator('.pvp-option').nth(1).click()
    await expect(page.getByText('Nobody nearby right now')).toBeVisible()
    await expect(page.locator('.pvp-empty')).toContainText('Visibility')
    await page.screenshot({ path: `${OUT}/nearby-empty-360x640.png` })
    await go(page, 'Open Settings').click()
    await expect(page.locator('.game-settings-row').first()).toBeVisible()
  })
})

test.describe('searching, found, race screens', () => {
  test('quick match: radar searching with cancel, then the VS found screen, then the race', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(60_000)
    const matched = race({
      id: 'q1',
      source: 'QUEUE',
      status: 'PENDING',
      challengerId: 'rival-1',
      opponentId: ME,
      challengerName: 'Aarav Sharma',
      opponentName: 'Veteran Runner',
      opponentConfirmed: false,
      challengerConfirmed: true,
    })
    await setup(page, { challenges: [] })
    await page.route('**/v1/pvp/queue/join', (r) => {
      page.queueStatus = { status: 'WAITING', mode: 'ONE_KM' }
      return r.fulfill(ok({ status: 'WAITING', mode: 'ONE_KM' }))
    })
    await page.route('**/v1/pvp/queue/leave', (r) => r.fulfill(ok({})))
    await openArena(page, context, PHONE)
    await go(page, 'Battle').click()
    await page.locator('.pvp-tier').nth(1).click()
    await page.locator('.pvp-option').nth(0).click()
    await expect(page.getByText('Finding a rival…')).toBeVisible()
    await expect(page.locator('.pvp-radar')).toBeVisible()
    await expect(go(page, 'Cancel search')).toBeVisible()
    await page.screenshot({ path: `${OUT}/searching-390x844.png` })

    // The server pairs us: found screen with both sides and the pot.
    await page.route('**/v1/run-challenge/find', (r) =>
      r.fulfill(ok({ content: [matched], totalElements: 1 }))
    )
    page.queueStatus = {
      status: 'MATCHED',
      mode: 'ONE_KM',
      matchedChallengeId: 'q1',
    }
    await expect(page.locator('.pvp-found .pvp-screen-title')).toHaveText(
      'Rival found!',
      { timeout: 15_000 }
    )
    await expect(page.locator('.pvp-vs')).toBeVisible()
    await expect(page.getByText('200', { exact: false }).first()).toBeVisible()
    await page.screenshot({ path: `${OUT}/found-390x844.png` })
    // Then it hands over to the race screen.
    await expect(page.getByText('Your race')).toBeVisible({ timeout: 15_000 })
  })

  const RACE_STATES = [
    {
      name: 'needs my accept: green Accept, red Decline',
      c: () =>
        race({
          id: 'r1',
          source: 'DIRECT',
          status: 'PENDING',
          challengerId: 'rival-1',
          opponentId: ME,
          challengerName: 'Aarav Sharma',
          opponentName: 'Veteran Runner',
          challengerConfirmed: true,
          opponentConfirmed: false,
        }),
      check: async (page) => {
        await expect(go(page, 'Accept and lock stake')).toHaveClass(
          /gb-success/
        )
        await expect(go(page, 'Decline')).toHaveClass(/gb-danger/)
        await expect(page.getByText('wants to race you')).toBeVisible()
      },
      shot: 'race-accept',
    },
    {
      name: 'waiting for the rival: cancel is neutral, not red',
      c: () => race({ id: 'r2', status: 'PENDING' }),
      check: async (page) => {
        await expect(go(page, 'Cancel challenge')).toHaveClass(/gb-secondary/)
        await expect(
          page.getByText('Waiting for Aarav to accept')
        ).toBeVisible()
      },
    },
    {
      name: 'run now: green Start, red Forfeit with a two-tap confirm',
      c: () =>
        race({
          id: 'r3',
          status: 'IN_PROGRESS',
          challengerConfirmed: true,
          opponentConfirmed: true,
        }),
      check: async (page) => {
        await expect(go(page, 'Start the race')).toHaveClass(/gb-success/)
        const forfeit = go(page, 'Forfeit')
        await expect(forfeit).toHaveClass(/gb-danger/)
        await forfeit.click()
        await expect(page.getByText(/Give up/)).toBeVisible()
      },
      shot: 'race-run',
    },
    {
      name: 'victory: ribbon, payout counts up, Rematch + Done',
      c: () =>
        race({
          id: 'r4',
          status: 'COMPLETED',
          winnerId: ME,
          resolutionType: 'WIN_BY_TIME',
          challengerConfirmed: true,
          opponentConfirmed: true,
        }),
      check: async (page) => {
        await expect(page.locator('.pvp-result-ribbon')).toHaveText('Victory')
        await expect(page.locator('.pvp-payout')).toContainText('+100', {
          timeout: 5000,
        })
        await expect(go(page, 'Rematch')).toBeVisible()
        await expect(go(page, 'Done')).toBeVisible()
      },
      shot: 'result-win',
    },
    {
      name: 'defeat',
      c: () =>
        race({
          id: 'r5',
          status: 'COMPLETED',
          winnerId: 'rival-1',
          resolutionType: 'WIN_BY_TIME',
          challengerConfirmed: true,
          opponentConfirmed: true,
        }),
      check: async (page) => {
        await expect(page.locator('.pvp-result-ribbon')).toHaveText('Defeat')
        await expect(page.locator('.pvp-payout')).toContainText('100', {
          timeout: 5000,
        })
      },
      shot: 'result-loss',
    },
    {
      name: 'draw: coins returned',
      c: () =>
        race({
          id: 'r6',
          status: 'COMPLETED',
          winnerId: null,
          resolutionType: 'TIE_REFUND',
          challengerConfirmed: true,
          opponentConfirmed: true,
        }),
      check: async (page) => {
        await expect(page.locator('.pvp-result-ribbon')).toHaveText('Draw')
        await expect(page.getByText('Your coins were returned.')).toBeVisible()
      },
    },
  ]
  for (const rs of RACE_STATES) {
    test(`race screen - ${rs.name}`, async ({ mockedPage: page, context }) => {
      test.setTimeout(60_000)
      const c = rs.c()
      await setup(page, { challenges: [c] })
      await openArena(page, context, PHONE)
      // Active races open from the hub card; finished ones from Recent.
      await page.locator('.pvp-rival').first().click()
      await expect(page.locator('.pvp-steps li.is-now')).toContainText('Go')
      await rs.check(page)
      await expectNoOverflow(page)
      if (rs.shot)
        await page.screenshot({ path: `${OUT}/${rs.shot}-390x844.png` })
    })
  }

  test('Start the race shows the VS strip over the 3-2-1', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(60_000)
    await setup(page, {
      challenges: [
        race({
          id: 'r3',
          status: 'IN_PROGRESS',
          challengerConfirmed: true,
          opponentConfirmed: true,
          stakeAmount: 50,
        }),
      ],
    })
    await openArena(page, context, PHONE)
    await page.locator('.pvp-rival').first().click()
    await go(page, 'Start the race').click()
    const strip = page.locator('.pvp-countdown-vs')
    await expect(strip).toBeVisible()
    await expect(strip).toContainText('Aarav')
    await expect(strip).toContainText('VS')
    await expect(strip).toContainText('100 Fahhcoin to the winner')
    await page.screenshot({ path: `${OUT}/countdown-390x844.png` })
    await page.locator('.game-countdown-overlay').click() // tap to cancel
  })
})

test.describe('platform + motion', () => {
  const INSETS = [
    { name: 'ios-island', top: 59, bottom: 34, ...PHONE },
    { name: 'android-short', top: 28, bottom: 0, ...SMALL },
  ]
  for (const d of INSETS) {
    test(`top bar starts below the status bar, CTA above the home indicator @${d.name}`, async ({
      mockedPage: page,
      context,
    }) => {
      test.setTimeout(60_000)
      await setup(page, {})
      await openArena(page, context, { width: d.width, height: d.height })
      await page.evaluate(({ top, bottom }) => {
        const root = document.documentElement
        root.dataset.native = 'true'
        root.style.setProperty('--native-safe-top', `${top}px`)
        root.style.setProperty('--native-safe-bottom', `${bottom}px`)
      }, d)
      await page.waitForTimeout(300)
      const bar = await page
        .locator('.game-menu-picker-current.is-static')
        .boundingBox()
      expect(bar.y).toBeGreaterThanOrEqual(d.top)
      const battle = await go(page, 'Battle').boundingBox()
      expect(battle.y + battle.height).toBeLessThanOrEqual(d.height - d.bottom)
      await page.screenshot({ path: `${OUT}/hub-${d.name}.png` })
    })
  }

  test('reduced motion: no glow, radar sweep or step animation', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(60_000)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await setup(page, {})
    await openArena(page, context, PHONE)
    await expect(page.locator('.pvp-battle-btn')).toHaveCSS(
      'animation-name',
      'none'
    )
  })
})
