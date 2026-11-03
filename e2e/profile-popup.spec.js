import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import {
  VETERAN,
  BLAZE_IDLE,
  CAPTAIN,
  INDIVIDUAL_LEADERBOARD,
} from './mocks/personas.js'

// Leaderboard rows carry no nickname (confirmed against
// IndividualLeaderboardResponse directly - see src/utils/playerName.js's
// own comment), so both the row and the popup title fall back to the
// first word of fullName, not the full string.
const firstWord = (name) => name.split(/\s+/)[0]

// The bug this session found and fixed (see src/utils/athleteProfileHero.js):
// another player's profile popup used to never show their equipped emote at
// all, and 4 of 7 heroes fell back to a flat/broken image instead of the
// animated hero-coloured stage. This spec is the regression test for both,
// at the real-DOM level - the unit tests in
// src/utils/athleteProfileHero.test.js cover the resolver logic itself.
test.describe('Profile popup - cross-user correctness', () => {
  test.beforeEach(async ({ mockedPage: page, context }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
    // Logged in as a THIRD persona, distinct from both profiles being
    // opened - opening your own leaderboard entry is a different, already-
    // covered code path (isSelf, see athleteProfileHero.test.js), not what
    // this spec is checking.
    await seedSession(page, CAPTAIN)
  })

  test("opening two different players in a row shows each one's own hero/emote, never the other's", async ({
    mockedPage: page,
  }) => {
    // mockApi's own defaults assume the veteran is logged in - override
    // both to match the captain session seeded above.
    await page.route('**/v1/user/find/logged-in', (route) =>
      route.fulfill(ok(CAPTAIN.user))
    )
    await page.route('**/v1/territory/profile', (route) =>
      route.fulfill(ok(CAPTAIN.territoryProfile))
    )
    await page.route('**/v1/leaderboard/individual/find', (route) =>
      route.fulfill(
        ok({
          content: INDIVIDUAL_LEADERBOARD,
          totalElements: INDIVIDUAL_LEADERBOARD.length,
        })
      )
    )
    await page.route(`**/v1/territory/profile/${VETERAN.id}`, (route) =>
      route.fulfill(ok(VETERAN.territoryProfile))
    )
    await page.route(`**/v1/territory/profile/${BLAZE_IDLE.id}`, (route) =>
      route.fulfill(ok(BLAZE_IDLE.territoryProfile))
    )

    await page.goto('/game')
    await expect(page.locator('.game-loading-overlay')).toBeHidden({
      timeout: 30_000,
    })
    await page.locator('.game-menu-btn').click()
    await page.getByRole('button', { name: 'Leaderboard' }).click()
    await expect(page.locator('.lb-row, .lb-podium-spot').first()).toBeVisible({
      timeout: 10_000,
    })

    // Open the veteran (Nova + Emote2) first.
    await page
      .locator('.lb')
      .getByText(firstWord(VETERAN.fullName))
      .first()
      .click()
    await expect(page.locator('.game-menu-player-name')).toHaveText(
      firstWord(VETERAN.fullName)
    )
    await expect(page.locator('.hero-stage-bg')).toHaveAttribute(
      'src',
      /heroes\/nova\//,
      {
        timeout: 10_000,
      }
    )
    // The equipped emote plays on the main stage, not a separate badge
    // (EquippedEmoteBadge was removed - see git history) - EmoteGlyph
    // renders an AnimatedSprite, never a plain <img>, when it has real art.
    await expect(
      page.locator('.game-menu-hero .emote-glyph-sprite')
    ).toBeVisible()

    await page.locator('.athlete-profile-close').click()
    await expect(page.locator('.athlete-profile-overlay')).toBeHidden()

    // Then Blaze (idle, no emote) - must not still show Nova's stage/emote.
    await page
      .locator('.lb')
      .getByText(firstWord(BLAZE_IDLE.fullName))
      .first()
      .click()
    await expect(page.locator('.game-menu-player-name')).toHaveText(
      firstWord(BLAZE_IDLE.fullName)
    )
    await expect(page.locator('.hero-stage-bg')).toHaveAttribute(
      'src',
      /heroes\/blaze\//,
      {
        timeout: 10_000,
      }
    )
    await expect(page.locator('.hero-stage-bg')).not.toHaveAttribute(
      'src',
      /heroes\/nova\//
    )
    await expect(
      page.locator('.game-menu-hero .emote-glyph-sprite')
    ).toHaveCount(0)
  })
})
