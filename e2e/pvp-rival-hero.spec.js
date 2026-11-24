import fs from 'node:fs'
import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'
import { scriptGps } from './helpers/gps.js'

// PvP hub "next rival" card + race list: the opponent's real hero (static
// frame) and nickname-or-name, long names clipped, unknown hero -> fallback.
// Screenshots (360 + 390) -> RIVAL_SHOTS when set.
const SHOTS = process.env.RIVAL_SHOTS || ''
const ME = VETERAN.user.id
const in2h = () => new Date(Date.now() + 2 * 3600_000).toISOString()
const race = (over) => ({
  id: 'c1',
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
  expiresAt: in2h(),
  ...over,
})

async function openHub(page, challenges) {
  await seedSession(page, VETERAN)
  await scriptGps(page)
  await page.addInitScript(() =>
    localStorage.setItem('fahhkit_pvp_discoverable', 'true')
  )
  await page.route('**/v1/run-challenge/find', (r) =>
    r.fulfill(ok({ content: challenges, totalElements: challenges.length }))
  )
  await page.route('**/v1/pvp/queue/status', (r) => r.fulfill(ok(null)))
  await page.route('**/v1/pvp/discovery/**', (r) => r.fulfill(ok([])))
  await page.addLocatorHandler(page.locator('.idle-nudge-backdrop'), () =>
    page.getByText('Not now').click()
  )
  await page.addLocatorHandler(page.locator('.challenge-prompt-backdrop'), () =>
    page.getByRole('button', { name: /Decide later/ }).click()
  )
  await page.goto('/game')
  await expect(page.locator('.game-hud-level')).toBeVisible({ timeout: 90_000 })
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('button', { name: 'PvP', exact: true }).click()
  await expect(page.locator('.pvp-arena')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.portal-clouds')).toHaveCount(0, { timeout: 8000 })
}

async function shot(page, testInfo, name) {
  if (!SHOTS) return
  fs.mkdirSync(SHOTS, { recursive: true })
  await page.waitForTimeout(600)
  await page.screenshot({
    path: `${SHOTS}/${name}-${testInfo.project.name}.png`,
  })
}

const noOverflow = (page) =>
  page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    return [...document.querySelectorAll('.pvp-arena *')]
      .filter((el) => el.getBoundingClientRect().right > vw + 1)
      .map((el) => el.className)
      .slice(0, 5)
  })

test.describe('PvP next rival', () => {
  test.setTimeout(150_000)

  test('real hero + nickname; long nickname is clipped, nothing overflows', async ({
    mockedPage: page,
  }, testInfo) => {
    const long = 'TheUnstoppableLightningRunnerOfKathmanduValley'
    await openHub(page, [
      race({
        opponentNickname: long,
        opponentHeroName: 'Blaze',
        opponentHeroId: 'h-blaze',
        opponentHeroColor: 'red',
      }),
    ])
    const card = page.locator('.pvp-banner')
    await expect(card.locator('.pvp-rival-hero')).toBeVisible()
    await expect(card.locator('.pvp-rival-hero')).toHaveAttribute(
      'data-hero',
      'Blaze'
    )
    await expect(card.locator('.pvp-silhouette')).toHaveCount(0)
    await expect(card).toContainText(long.slice(0, 20))
    expect(await noOverflow(page)).toEqual([])
    // the long name is ellipsised, not wrapped over the card
    const el = card.locator('.pvp-vs-name').last()
    expect(await el.evaluate((n) => n.scrollWidth > n.clientWidth)).toBe(true)
    // the race list shows the same nickname
    await expect(page.locator('.pvp-race .pvp-rival-name')).toContainText(
      long.slice(0, 20)
    )
    await shot(page, testInfo, '1-hero-and-long-nickname')
  })

  test('blank nickname -> first name; unknown hero -> default hero in the same frame, not a letter', async ({
    mockedPage: page,
  }) => {
    await openHub(page, [
      race({ opponentNickname: '   ', opponentHeroName: 'Totally Unknown' }),
    ])
    const card = page.locator('.pvp-banner')
    await expect(card).toContainText('Aarav')
    await expect(card).not.toContainText('Sharma')
    const rival = card.locator('.pvp-rival-hero')
    await expect(rival).toBeVisible()
    await expect(rival).toHaveAttribute('data-hero-default', 'true')
    // same stage frame as my own hero
    await expect(card.locator('.pvp-hero-fig .pvp-hero-stage')).toHaveCount(2)
  })

  test('Your race screen: real rival hero beside mine', async ({
    mockedPage: page,
  }) => {
    await openHub(page, [
      race({ opponentHeroName: 'Cyclone', opponentHeroId: 'h-cy' }),
    ])
    await page.locator('.pvp-race').first().click()
    await expect(page.getByText('Your race')).toBeVisible()
    const stage = page.locator('.pvp-vs-stage')
    await expect(stage.locator('.pvp-hero-fig')).toHaveCount(2, {
      timeout: 20_000,
    })
    await expect(stage.locator('.pvp-rival-hero')).toHaveAttribute(
      'data-hero',
      'Cyclone'
    )
    expect(await noOverflow(page)).toEqual([])
  })

  test('Your race screen: no hero from the server -> default hero, not an initial', async ({
    mockedPage: page,
  }) => {
    await openHub(page, [race({})])
    await page.locator('.pvp-race').first().click()
    await expect(page.getByText('Your race')).toBeVisible()
    await expect(page.locator('.pvp-vs-stage .pvp-rival-hero')).toHaveAttribute(
      'data-hero-default',
      'true',
      { timeout: 20_000 }
    )
    await expect(page.locator('.pvp-vs-stage .pvp-hero-fig')).toHaveCount(2, {
      timeout: 20_000,
    })
  })

  test("today's server (no nickname/hero fields): unchanged card", async ({
    mockedPage: page,
  }, testInfo) => {
    await openHub(page, [])
    await expect(page.locator('.pvp-banner .pvp-silhouette')).toBeVisible()
    await expect(page.locator('.pvp-banner')).toContainText('Your next rival')
    await shot(page, testInfo, '3-no-rival-yet')
  })

  test("hero comes from the rival's public profile (no backend change needed)", async ({
    mockedPage: page,
  }) => {
    let profileCalls = 0
    await page.route('**/v1/territory/profile/rival-1', (r) => {
      profileCalls += 1
      return r.fulfill(
        ok({
          userId: 'rival-1',
          level: 9,
          equippedCosmetics: [
            {
              equipped: true,
              storeItem: { category: 'HERO', name: 'Bolt', heroId: 'h-bolt' },
            },
          ],
        })
      )
    })
    await openHub(page, [race({})]) // the challenge itself carries no hero
    await page.locator('.pvp-race').first().click()
    await expect(page.getByText('Your race')).toBeVisible()
    await expect(page.locator('.pvp-vs-stage .pvp-rival-hero')).toHaveAttribute(
      'data-hero',
      'Bolt',
      { timeout: 20_000 }
    )
    await expect(
      page.locator('.pvp-vs-stage .pvp-rival-hero')
    ).not.toHaveAttribute('data-hero-default', 'true')
    expect(profileCalls).toBe(1) // cached: not once per screen / render
  })

  test('profile has no hero, or the profile call fails -> default hero, never a letter', async ({
    mockedPage: page,
  }) => {
    page.allowFailedRequests = true
    await page.route('**/v1/territory/profile/rival-1', (r) =>
      r.fulfill({ status: 500, body: '{}', contentType: 'application/json' })
    )
    await openHub(page, [race({})])
    await page.locator('.pvp-race').first().click()
    await expect(page.locator('.pvp-vs-stage .pvp-rival-hero')).toHaveAttribute(
      'data-hero-default',
      'true',
      { timeout: 15_000 }
    )
  })
})
