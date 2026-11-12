import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Regression/visual coverage for the Club War History per-member stats
// rebuild (rank/avatar/name/hero + compact stat line + "+N pts" + expand
// row). Four war shapes per the brief: a win, a loss, a war with missed
// members (sunk to the bottom, muted "0 pts"), and a long-name case (club
// + player names long enough to test truncation/wrap at 390px). Each is
// its own test so a failure in one doesn't hide the others; screenshots
// saved to ./screenshots/war-history/, named by scenario + viewport
// project (mobile-390 / desktop-1440 - see playwright.config.js).
const ME = VETERAN

function participant({
  userId,
  fullName,
  nickname = null,
  heroName,
  ran,
  score = 0,
  rewarded = false,
  outcome = 'SUCCESS',
  runSubmittedAt = '2026-11-09T14:32:00',
}) {
  return {
    userId,
    fullName,
    nickname,
    profilePictureUrl: null,
    heroStoreItemId: ran ? `storeitem-hero-${userId}` : null,
    heroName: ran ? heroName : null,
    runId: ran ? `run-${userId}` : null,
    runSubmittedAt: ran ? runSubmittedAt : null,
    runOutcome: ran ? outcome : null,
    paceComponent: ran ? Math.round(score * 0.4) : null,
    baseEffortComponent: ran ? Math.round(score * 0.6) : null,
    contributedScore: ran ? score : 0,
    rewarded: ran && rewarded,
  }
}

function warSummary({
  warId,
  myClubName,
  opponentClubName,
  result,
  myScore,
  opponentScore,
}) {
  return {
    warId,
    squadSize: 5,
    result,
    myClubId: 'club-mine',
    myClubName,
    opponentClubId: 'club-opp',
    opponentClubName,
    myScore,
    opponentScore,
    myTrophiesBefore: 1200,
    myTrophyChange: result === 'WIN' ? 18 : -12,
    myTrophiesAfter: result === 'WIN' ? 1218 : 1188,
    opponentTrophiesBefore: 1180,
    opponentTrophyChange: result === 'WIN' ? -18 : 12,
    opponentTrophiesAfter: result === 'WIN' ? 1162 : 1192,
    matchedAt: '2026-11-08T14:00:00',
    battleEndsAt: '2026-11-09T14:00:00',
    resolvedAt: '2026-11-09T15:10:00',
  }
}

// --- Won war - my club wins, everyone ran, two members rewarded. ---
const WON_WAR = {
  ...warSummary({
    warId: 'war-won',
    myClubName: 'Night Owls',
    opponentClubName: 'Dawn Patrol',
    result: 'WIN',
    myScore: 450,
    opponentScore: 320,
  }),
  myParticipants: [
    participant({
      userId: ME.id,
      fullName: ME.fullName,
      nickname: ME.nickname,
      heroName: 'Nova',
      ran: true,
      score: 180,
      rewarded: true,
    }),
    participant({
      userId: 'u-blaze',
      fullName: 'Sam Carter',
      heroName: 'Blaze',
      ran: true,
      score: 150,
      rewarded: true,
    }),
    participant({
      userId: 'u-bolt',
      fullName: 'Priya Shah',
      heroName: 'Bolt',
      ran: true,
      score: 120,
      rewarded: true,
    }),
  ],
  opponentParticipants: [
    participant({
      userId: 'u-opp1',
      fullName: 'Dana Lee',
      heroName: 'Comet',
      ran: true,
      score: 200,
      rewarded: false,
    }),
    participant({
      userId: 'u-opp2',
      fullName: 'Rafael Nunez',
      heroName: 'Cyclone',
      ran: true,
      score: 120,
      rewarded: false,
    }),
  ],
}

// --- Lost war - my club loses, nobody on my side gets XP. ---
const LOST_WAR = {
  ...warSummary({
    warId: 'war-lost',
    myClubName: 'Night Owls',
    opponentClubName: 'Iron Pace',
    result: 'LOSS',
    myScore: 210,
    opponentScore: 380,
  }),
  myParticipants: [
    participant({
      userId: ME.id,
      fullName: ME.fullName,
      nickname: ME.nickname,
      heroName: 'Nova',
      ran: true,
      score: 110,
      rewarded: false,
    }),
    participant({
      userId: 'u-blaze',
      fullName: 'Sam Carter',
      heroName: 'Blaze',
      ran: true,
      score: 100,
      rewarded: false,
    }),
  ],
  opponentParticipants: [
    participant({
      userId: 'u-opp1',
      fullName: 'Dana Lee',
      heroName: 'Comet',
      ran: true,
      score: 220,
      rewarded: true,
    }),
    participant({
      userId: 'u-opp2',
      fullName: 'Rafael Nunez',
      heroName: 'Cyclone',
      ran: true,
      score: 160,
      rewarded: true,
    }),
  ],
}

// --- Missed members - two of four on my side never ran: 0 pts, muted,
// sorted to the bottom regardless of score. ---
const MISSED_WAR = {
  ...warSummary({
    warId: 'war-missed',
    myClubName: 'Night Owls',
    opponentClubName: 'Trail Blazers',
    result: 'WIN',
    myScore: 300,
    opponentScore: 90,
  }),
  myParticipants: [
    participant({
      userId: ME.id,
      fullName: ME.fullName,
      nickname: ME.nickname,
      heroName: 'Nova',
      ran: true,
      score: 180,
      rewarded: true,
    }),
    participant({
      userId: 'u-blaze',
      fullName: 'Sam Carter',
      heroName: 'Blaze',
      ran: true,
      score: 120,
      rewarded: true,
    }),
    participant({ userId: 'u-missed1', fullName: 'Jordan Pike', ran: false }),
    participant({ userId: 'u-missed2', fullName: 'Casey Wu', ran: false }),
  ],
  opponentParticipants: [
    participant({
      userId: 'u-opp1',
      fullName: 'Dana Lee',
      heroName: 'Comet',
      ran: true,
      score: 90,
      rewarded: false,
    }),
  ],
}

// --- Long names - club names and a player nickname long enough to force
// real wrapping/truncation decisions at 390px, not just normal-length
// text that happens to fit. ---
const LONG_NAME_WAR = {
  ...warSummary({
    warId: 'war-long-names',
    myClubName: 'The Unstoppable Midnight Marathon Warriors Alliance',
    opponentClubName: 'Legendary Order of the Early Morning Sprint Society',
    result: 'WIN',
    myScore: 300,
    opponentScore: 250,
  }),
  myParticipants: [
    participant({
      userId: ME.id,
      fullName: ME.fullName,
      nickname: ME.nickname,
      heroName: 'Nova',
      ran: true,
      score: 160,
      rewarded: true,
    }),
    participant({
      userId: 'u-long1',
      fullName: 'Maximilian Alexanderson-Fitzgerald',
      nickname: 'MaximilianTheUnstoppableRunner',
      heroName: 'Phantom',
      ran: true,
      score: 140,
      rewarded: true,
    }),
  ],
  opponentParticipants: [
    participant({
      userId: 'u-opp1',
      fullName: 'Dana Lee',
      heroName: 'Comet',
      ran: true,
      score: 250,
      rewarded: false,
    }),
  ],
}

const WARS_BY_ID = {
  'war-won': WON_WAR,
  'war-lost': LOST_WAR,
  'war-missed': MISSED_WAR,
  'war-long-names': LONG_NAME_WAR,
}

const WAR_LIST = Object.values(WARS_BY_ID).map((w) => ({
  ...w,
  myParticipants: null,
  opponentParticipants: null,
}))

async function openClub(page) {
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Club', exact: true }).click()
  await page.getByRole('button', { name: 'Club Wars', exact: true }).click()
  await page.getByText('War History').click()
}

async function openWar(page, warId) {
  const war = WARS_BY_ID[warId]
  // myClubName alone isn't unique across these fixtures (three of the four
  // share "Night Owls") - the vs-pairing is, since each war's opponent
  // differs.
  await page
    .getByRole('button', {
      name: `${war.myClubName} vs ${war.opponentClubName}`,
    })
    .click()
  await expect(page.locator('.club-war-history-detail')).toBeVisible({
    timeout: 10_000,
  })
}

test.describe('Club War History - per-member stats', () => {
  test.beforeEach(async ({ mockedPage: page, context }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
    await seedSession(page, ME)

    await page.route('**/v1/club/mine', (route) =>
      route.fulfill(
        ok({
          id: 'club-mine',
          name: 'Night Owls',
          description: '',
          memberCount: 5,
          leaderName: ME.fullName,
        })
      )
    )
    await page.route('**/v1/club-war/history', (route) =>
      route.fulfill(ok({ content: WAR_LIST, totalPages: 1 }))
    )
    await page.route(/\/v1\/club-war\/history\/(.+)$/, (route) => {
      const warId = decodeURIComponent(
        route.request().url().split('/history/')[1]
      )
      route.fulfill(ok(WARS_BY_ID[warId]))
    })

    await page.goto('/game')
    await expect(page.locator('.game-loading-overlay')).toBeHidden({
      timeout: 30_000,
    })
  })

  for (const [warId, label] of [
    ['war-won', 'won'],
    ['war-lost', 'lost'],
    ['war-missed', 'missed-members'],
    ['war-long-names', 'long-names'],
  ]) {
    test(`${label} war - row layout, summary row, and expand`, async ({
      mockedPage: page,
    }, testInfo) => {
      await openClub(page)
      await openWar(page, warId)

      // Expand the top (MVP) row on my side to also capture the run
      // breakdown + contribution bar + hero-perk-bonus line in the shot.
      await page
        .locator('.club-war-history-squad')
        .first()
        .locator('.club-war-history-participant')
        .first()
        .click()
      await expect(
        page.locator('.club-war-history-expanded').first()
      ).toBeVisible()

      await expectNoHorizontalScroll(page)

      const outPath = `screenshots/war-history/${label}-${testInfo.project.name}.png`
      await page.screenshot({ path: outPath, fullPage: true })
      testInfo.annotations.push({
        type: 'screenshot-path',
        description: outPath,
      })

      // The club/war screen scrolls inside .game-menu-sheet, not the
      // document - page.screenshot({fullPage:true}) above only reaches the
      // outer document's own scroll height, which cuts off member rows
      // past the viewport (missed members, the opponent squad on mobile,
      // ...). A second shot scrolled to the bottom of that inner panel
      // actually proves the rest of the list - sorting, muted "0 pts" on a
      // missed member, both squads - renders correctly too.
      await page.locator('.game-menu-sheet').evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      const scrolledPath = `screenshots/war-history/${label}-${testInfo.project.name}-scrolled.png`
      await page.screenshot({ path: scrolledPath })
      testInfo.annotations.push({
        type: 'screenshot-path',
        description: scrolledPath,
      })
    })
  }
})

async function expectNoHorizontalScroll(page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  )
  expect(overflow, 'horizontal overflow at this viewport').toBeLessThanOrEqual(
    1
  )
}
