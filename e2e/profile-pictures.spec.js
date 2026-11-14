import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN, CAPTAIN, INDIVIDUAL_LEADERBOARD } from './mocks/personas.js'

// Profile pictures on the territory popup, another player's profile and the
// Me tab. Run on the mobile-390 and desktop-1440 projects. Mocked API; the
// picture files are served by route stubs.
//
// Cases: an absolute URL, a relative path (resolved against the file base
// URL, https://cafebizarre.com.np/ in .env), no picture, and a URL that
// fails to load (the letter avatar must stay).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

// A territory that surrounds the player's position (the map centre), so a tap
// near the centre always lands on it (parcels are drawn on a canvas - there is
// no DOM polygon to click).
const BIG_SQUARE = [
  [
    [85.321, 27.714],
    [85.327, 27.714],
    [85.327, 27.72],
    [85.321, 27.72],
    [85.321, 27.714],
  ],
]

const CASES = [
  { id: 'present', url: 'https://pics.test/a.png', photo: true },
  {
    id: 'relative',
    url: 'profile/pic-a.png',
    photo: true,
    srcMatches: /cafebizarre\.com\.np\/profile\/pic-a\.png$/,
  },
  { id: 'none', url: null, photo: false },
  { id: 'broken', url: 'https://pics.test/broken.png', photo: false },
]

async function stubPictures(page) {
  const serve = (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
  await page.route('https://pics.test/**', (route) =>
    route.request().url().includes('broken')
      ? route.fulfill({ status: 404, body: 'nope' })
      : serve(route)
  )
  await page.route('https://cafebizarre.com.np/profile/**', serve)
}

async function boot(page, context) {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  await stubPictures(page)
}

async function openGame(page) {
  await page.goto('/game')
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 30_000,
  })
}

// The idle "Legs asleep?" nudge can sit over the map - dismiss it if it is
// there, then tap the territory polygon.
async function tapParcel(page) {
  await page
    .getByRole('button', { name: 'Not now' })
    .click({ timeout: 14_000 }) // the nudge fires after 7s idle; "Not now" snoozes it 3 min
    .catch(() => {})
  // Just off the centre: the player's own marker sits dead centre. The map
  // can still be panning/zooming to the player when the first tap lands, so
  // re-read the box and re-tap until the popup opens.
  await expect(async () => {
    const map = await page.locator('.leaflet-container').first().boundingBox()
    await page.mouse.click(
      map.x + map.width / 2 - 90,
      map.y + map.height / 2 - 140
    )
    await expect(page.locator('.game-territory-popup')).toBeVisible({
      timeout: 1500,
    })
  }).toPass({ timeout: 20_000 })
}

function shot(page, testInfo, name) {
  return page.screenshot({
    path: `screenshots/profile-pictures/${name}-${testInfo.project.name}.png`,
  })
}

// The photo is shown (an <img>) or the letter avatar is (role=img span).
async function expectAvatar(scope, c) {
  if (c.photo) {
    const img = scope.locator('img.g-avatar')
    await expect(img).toBeVisible()
    if (c.srcMatches) await expect(img).toHaveAttribute('src', c.srcMatches)
    await expect(scope.locator('.g-avatar-fallback')).toHaveCount(0)
  } else {
    await expect(scope.locator('.g-avatar-fallback')).toBeVisible()
    await expect(scope.locator('img.g-avatar')).toHaveCount(0)
  }
}

// Shared layout checks for the big profile avatar.
async function expectProfileLayout(page, testInfo, panelSelector) {
  const card = page.getByTestId('profile-avatar')
  await expect(card).toBeVisible()
  const avatar = card.locator('.g-avatar').first()
  const [a, panel, bar, name, close] = await Promise.all([
    avatar.boundingBox(),
    page.locator(panelSelector).boundingBox(),
    page.locator('.game-level-hud').boundingBox(),
    page.locator('.game-menu-player-name').boundingBox(),
    page
      .locator('.athlete-profile-close, .game-menu-close')
      .first()
      .boundingBox(),
  ])
  const expected = testInfo.project.name.startsWith('desktop') ? 112 : 92
  expect(Math.round(a.width)).toBe(expected)
  expect(Math.round(a.height)).toBe(expected)
  // Horizontally centred in its panel.
  expect(
    Math.abs(a.x + a.width / 2 - (panel.x + panel.width / 2))
  ).toBeLessThanOrEqual(2)
  // Order: XP bar, then avatar, then name.
  expect(a.y).toBeGreaterThanOrEqual(bar.y + bar.height)
  expect(name.y).toBeGreaterThanOrEqual(a.y + a.height - 2)
  // Level badge shown, nothing overlapping the close button.
  await expect(card.locator('.g-avatar-level')).toBeVisible()
  if (close) {
    const overlap =
      a.x < close.x + close.width &&
      a.x + a.width > close.x &&
      a.y < close.y + close.height &&
      a.y + a.height > close.y
    expect(overlap).toBe(false)
  }
}

test.setTimeout(90_000) // nudge wait + map settle + retry taps, 3 workers

test.describe('Territory popup avatar', () => {
  for (const c of CASES) {
    test(`other player's territory - ${c.id}`, async ({
      mockedPage: page,
      context,
    }, testInfo) => {
      await boot(page, context)
      await seedSession(page, VETERAN)
      await page.route('**/v1/territory/parcel/near**', (route) =>
        route.fulfill(
          ok([
            {
              id: 9101,
              ownerId: CAPTAIN.id,
              ownerName: CAPTAIN.fullName,
              ownerProfilePictureUrl: c.url,
              areaSqMeters: 123456,
              currentScore: 4321,
              geometry: BIG_SQUARE,
            },
          ])
        )
      )
      await openGame(page)
      await tapParcel(page)
      const popup = page.locator('.game-territory-popup')
      await expect(popup).toBeVisible()
      await expectAvatar(popup.locator('.game-highlight-toast-header'), c)
      // Same size as before (60px circle) once the scale-in has settled.
      await expect
        .poll(async () => {
          // offsetWidth is layout size - boundingBox() includes the popup's
          // scale-in transform and reads 54 (60 x 0.9) mid-animation.
          return popup
            .locator('.game-highlight-toast-avatar')
            .evaluate((el) => el.offsetWidth)
            .catch(() => 0)
        })
        .toBe(60)
      // The rest of the popup is unchanged.
      await expect(popup).toContainText('Territory owner')
      await shot(page, testInfo, `popup-${c.id}`)
    })
  }

  test('own territory shows the player’s own picture', async ({
    mockedPage: page,
    context,
  }, testInfo) => {
    await boot(page, context)
    await seedSession(page, VETERAN)
    await page.route('**/v1/user/find/logged-in', (route) =>
      route.fulfill(
        ok({ ...VETERAN.user, profilePictureUrl: 'https://pics.test/a.png' })
      )
    )
    await page.route('**/v1/territory/parcel/near**', (route) =>
      route.fulfill(
        ok([
          {
            id: 9102,
            ownerId: VETERAN.id,
            ownerName: VETERAN.fullName,
            areaSqMeters: 5000,
            currentScore: 10,
            geometry: BIG_SQUARE,
          },
        ])
      )
    )
    await openGame(page)
    await tapParcel(page)
    await expectAvatar(
      page.locator('.game-territory-popup .game-highlight-toast-header'),
      CASES[0]
    )
    await shot(page, testInfo, 'popup-own')
  })
})

test.describe("Another player's profile", () => {
  for (const c of CASES) {
    test(c.id, async ({ mockedPage: page, context }, testInfo) => {
      await boot(page, context)
      await seedSession(page, CAPTAIN)
      await page.route('**/v1/user/find/logged-in', (route) =>
        route.fulfill(ok(CAPTAIN.user))
      )
      await page.route('**/v1/territory/profile', (route) =>
        route.fulfill(ok(CAPTAIN.territoryProfile))
      )
      await page.route('**/v1/leaderboard/individual/find', (route) =>
        route.fulfill(
          ok({
            content: INDIVIDUAL_LEADERBOARD.map((e) =>
              e.userId === VETERAN.id ? { ...e, profilePictureUrl: c.url } : e
            ),
            totalElements: INDIVIDUAL_LEADERBOARD.length,
          })
        )
      )
      let release
      const gate = new Promise((r) => (release = r))
      await page.route(
        `**/v1/territory/profile/${VETERAN.id}`,
        async (route) => {
          await gate
          return route.fulfill(ok(VETERAN.territoryProfile))
        }
      )
      await openGame(page)
      await page.locator('.game-menu-btn').click()
      await page.getByRole('button', { name: 'Leaderboard' }).click()
      await page
        .locator('.lb')
        .getByText(VETERAN.fullName.split(/\s+/)[0])
        .first()
        .click()

      // While the profile is loading: a round skeleton, no avatar yet.
      await expect(page.getByTestId('profile-avatar-skeleton')).toBeVisible()
      release()
      await expect(page.getByTestId('profile-avatar-skeleton')).toHaveCount(0)

      const card = page.getByTestId('profile-avatar')
      await expectAvatar(card, c)
      await expectProfileLayout(page, testInfo, '.athlete-profile-content')

      if (c.photo) {
        // Tap opens the full-size lightbox; tap closes it.
        await card.getByRole('button').click()
        await expect(page.getByTestId('profile-lightbox')).toBeVisible()
        await shot(page, testInfo, `profile-lightbox-${c.id}`)
        await page
          .getByTestId('profile-lightbox')
          .click({ position: { x: 5, y: 300 } })
        await expect(page.getByTestId('profile-lightbox')).toHaveCount(0)
        // ...and the red close button closes it too.
        await card.getByRole('button').click()
        await page.getByRole('button', { name: 'Close picture' }).click()
        await expect(page.getByTestId('profile-lightbox')).toHaveCount(0)
      } else {
        // Nothing to open without a picture.
        await expect(card.getByRole('button')).toHaveCount(0)
      }
      await shot(page, testInfo, `profile-other-${c.id}`)
    })
  }
})

test.describe('Own profile (Me tab)', () => {
  for (const c of CASES) {
    test(c.id, async ({ mockedPage: page, context }, testInfo) => {
      await boot(page, context)
      await seedSession(page, VETERAN)
      await page.route('**/v1/user/find/logged-in', (route) =>
        route.fulfill(ok({ ...VETERAN.user, profilePictureUrl: c.url }))
      )
      await openGame(page)
      await page.locator('.game-menu-btn').click()
      await page.getByRole('button', { name: 'Me', exact: true }).click()
      const card = page.getByTestId('profile-avatar')
      await expect(card).toBeVisible()
      await expectAvatar(card, c)
      await expectProfileLayout(page, testInfo, '.game-menu-panel')
      // The panel keeps its scroll position (bottom of the page otherwise),
      // so bring the avatar back into frame before capturing.
      await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await shot(page, testInfo, `me-${c.id}`)
    })
  }
})
