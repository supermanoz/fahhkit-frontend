import { test, expect } from '@playwright/test'

// The redesigned hero detail card (Shop -> hero modal), rendered through a
// small harness page (e2e/previews/hero-card.html mounts the real
// HeroDetailModal) so all 7 heroes x 5 states x 2 viewports can be captured
// without reloading the game each time. Screenshots: ./screenshots/hero-card/.
const SHOT_DIR = 'screenshots/hero-card'
const HEROES = [
  { name: 'Blaze', perk: null },
  { name: 'Bolt', perk: ['PACE', 1.06] },
  { name: 'Comet', perk: ['BASE_EFFORT', 1.04] },
  { name: 'Cyclone', perk: ['PERIMETER_EFFICIENCY', 1.1] },
  { name: 'Nova', perk: ['AREA', 1.05], unlockLevel: 5 },
  { name: 'Phantom', perk: ['CLOSURE_PRECISION', 1.12] },
  { name: 'Pulse', perk: ['RACE_TIME', 0.95] },
]
const STATES = ['owned', 'equipped', 'locked', 'level-locked', 'not-for-sale']
const LORE =
  'Raised on the rooftops and trained on the streets, he learned that every city is a map waiting to be claimed. ' +
  'They say he never stops for a red light, only for a good view.\n' +
  '        Now he laces up before sunrise, chasing the horizon one loop at a time and leaving a trail only the bravest can follow. ' +
  'Challenge him, and you will find out why the leaderboard has a permanent reservation.'

function buildProps(heroDef, state, overrides = {}) {
  const heroItem = {
    id: `item-${heroDef.name}`,
    category: 'HERO',
    name: heroDef.name,
    heroId: `hero-${heroDef.name}`,
    priceFahhcoin: state === 'locked' || state === 'not-for-sale' ? 5000 : 0,
    ...(heroDef.unlockLevel || state === 'level-locked'
      ? { unlockLevel: heroDef.unlockLevel || 5 }
      : {}),
  }
  const hero = {
    id: `hero-${heroDef.name}`,
    name: heroDef.name,
    tagline: `${heroDef.name} runs on vibes alone`,
    backstory: LORE,
    limited: state === 'not-for-sale',
    abilities: heroDef.perk
      ? [
          {
            id: 'a1',
            componentType: heroDef.perk[0],
            multiplier: heroDef.perk[1],
          },
        ]
      : [],
    skins: [heroItem],
    ...overrides.hero,
  }
  const owned = state === 'owned' || state === 'equipped'
  return {
    hero,
    ownedItems: owned
      ? [{ id: 'o1', storeItem: heroItem, equipped: state === 'equipped' }]
      : [],
    activeHeroId: state === 'equipped' ? hero.id : 'someone-else',
    isActive: state === 'equipped',
    level: state === 'level-locked' ? 1 : 10,
    ...overrides.props,
  }
}

async function show(page, props) {
  await page.evaluate((p) => window.__show(p), props)
  await expect(page.getByRole('dialog')).toBeVisible()
  // Entry stagger + bar fill (~1s), and the hero art.
  await page.waitForTimeout(1100)
}

async function assertFits(page) {
  const dialog = page.getByRole('dialog')
  const box = await dialog.boundingBox()
  const vp = page.viewportSize()
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 0.5)
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 0.5)
  const overflow = await page.evaluate(() => {
    const body = document.querySelector('.hero-modal-body')
    const modal = document.querySelector('.hero-modal')
    return {
      body: body.scrollWidth - body.clientWidth,
      modal: modal.scrollWidth - modal.clientWidth,
    }
  })
  expect(overflow.body).toBeLessThanOrEqual(1)
  expect(overflow.modal).toBeLessThanOrEqual(1)
  // The action bar is always visible (sticky), never scrolled away.
  const bar = await page.locator('.hero-modal-actionbar').boundingBox()
  expect(bar.y + bar.height).toBeLessThanOrEqual(vp.height + 0.5)
}

for (const vp of [
  { name: '390', width: 390, height: 844 },
  { name: '360', width: 360, height: 640 },
  { name: 'desktop', width: 1440, height: 900 },
]) {
  test.describe(`hero card @${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })
    test.setTimeout(420_000)
    test.beforeEach(async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-390', 'harness runs once')
      await page.goto('/e2e/previews/hero-card.html')
      await page.waitForFunction(() => window.__ready)
    })

    if (vp.name !== '360') {
      test('every hero in every state', async ({ page }) => {
        for (const heroDef of HEROES) {
          for (const state of STATES) {
            await show(page, buildProps(heroDef, state))
            const action = page.getByTestId('hero-action')
            if (state === 'owned') await expect(action).toHaveText(/Equip$/)
            if (state === 'equipped') {
              await expect(action).toHaveText(/Equipped/)
              await expect(action).toBeDisabled()
              await expect(page.getByTestId('hero-equipped-chip')).toBeVisible()
            }
            if (state === 'locked') {
              await expect(action).toContainText('Unlock for')
              await expect(action).toBeEnabled()
            }
            if (state === 'level-locked') {
              await expect(action).toContainText(/Reach level \d+ to unlock/)
              await expect(page.getByTestId('hero-level-chip')).toBeVisible()
            }
            if (state === 'not-for-sale') {
              await expect(action).toContainText('Not available yet')
              await expect(action).toBeDisabled()
            }
            await assertFits(page)
            await page.screenshot({
              path: `${SHOT_DIR}/${vp.name}/${heroDef.name.toLowerCase()}-${state}.png`,
            })
          }
        }
      })

      test('lore collapsed and expanded', async ({ page }) => {
        for (const heroDef of HEROES) {
          await show(page, buildProps(heroDef, 'owned'))
          const toggle = page.getByRole('button', { name: 'Read more' })
          await expect(toggle).toBeVisible()
          await page.locator('.hero-modal-body').evaluate((el) => {
            el.scrollTop = el.scrollHeight
          })
          await page.waitForTimeout(150)
          // Toggle never overlaps the lore text.
          const lore = await page.locator('.hero-modal-lore').boundingBox()
          const tb = await toggle.boundingBox()
          expect(tb.y).toBeGreaterThanOrEqual(lore.y + lore.height - 1)
          await page.screenshot({
            path: `${SHOT_DIR}/${vp.name}/${heroDef.name.toLowerCase()}-lore-collapsed.png`,
          })
          await toggle.click()
          await expect(
            page.getByRole('button', { name: 'Show less' })
          ).toBeVisible()
          await page.waitForTimeout(500)
          await page.locator('.hero-modal-body').evaluate((el) => {
            el.scrollTop = el.scrollHeight
          })
          await page.waitForTimeout(150)
          await page.screenshot({
            path: `${SHOT_DIR}/${vp.name}/${heroDef.name.toLowerCase()}-lore-expanded.png`,
          })
        }
      })
    }

    test('long names, taglines and lore do not overflow', async ({ page }) => {
      const long = {
        hero: {
          name: 'Bartholomew-Maximilian the Unstoppable Conqueror',
          tagline:
            'Never stops, never slows down, never ever takes the elevator when there are stairs to conquer',
          backstory: LORE + '\n' + LORE,
          abilities: [
            {
              id: 'a1',
              componentType: 'PERIMETER_EFFICIENCY',
              multiplier: 1.12,
            },
            { id: 'a2', componentType: 'CLOSURE_PRECISION', multiplier: 0.93 },
          ],
        },
      }
      await show(page, buildProps(HEROES[4], 'locked', long))
      await assertFits(page)
      await page.screenshot({ path: `${SHOT_DIR}/${vp.name}/long-text.png` })
    })
  })
}
