import fs from 'node:fs'
import { test, expect } from './fixtures/base.js'

// The post-run "Run Complete" stats + XP popup, on the real RunRewardsModal
// (e2e/previews/post-run.html): the same sequence for every mode - stats ->
// XP animation -> run image (Download PNG) -> Done; Skip only fast-forwards
// the animation; level-up and no-XP variants; long values fit at 320-412px.
// Screenshots (max 8) go to RUN_REWARDS_SHOTS when set.
const SHOTS = process.env.RUN_REWARDS_SHOTS || ''
const ring = (n = 24) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return {
      lat: 27.7172 + Math.sin(a) * 0.004,
      lng: 85.324 + Math.cos(a) * 0.005,
    }
  })
const RUN = {
  id: 7,
  points: ring(),
  distance: 5230,
  duration: 1800,
  avgPace: 5.73,
}
// 125:30 /km, 1:05:09, 12.45 km - the long values the tiles must hold.
const LONG = { ...RUN, distance: 12_450, duration: 3909, avgPace: 125.5 }
// Level curve floor(L) = 100 * (L-1)^2: level 5 = 1600..2500 (span 900).
const XP = { beforeLevel: 5, beforeXp: 1900, afterLevel: 5, afterXp: 2020 }
const LEVEL_UP = {
  beforeLevel: 5,
  beforeXp: 2450,
  afterLevel: 6,
  afterXp: 2600,
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'mobile-390',
    'harness sets its own viewports'
  )
  test.setTimeout(90_000)
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/e2e/previews/post-run.html')
  await page.waitForFunction(() => window.__ready)
})

const show = (page, props) => page.evaluate((p) => window.__image(p), props)
const next = (page) => page.getByRole('button', { name: 'Next', exact: true })
const shot = (page, name) =>
  SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : null

for (const [mode, title] of [
  ['training', 'Run saved'],
  ['territory', 'Run Complete'],
  ['pvp', 'PvP Result'],
  ['club_war', 'War Run Complete'],
]) {
  test(`${mode}: stats -> XP -> image slide (Download PNG) -> Done`, async ({
    page,
  }) => {
    await show(page, { run: RUN, mode, xpReward: XP })
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    // 1) stats
    for (const label of ['Distance', 'Time', 'Pace'])
      await expect(page.getByText(label, { exact: true })).toBeVisible()
    // 2) XP, image not shown yet
    await expect(page.locator('.run-rewards-xp-chip')).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Your run' })).toBeHidden()
    await expect(next(page)).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.run-rewards-xp-chip')).toHaveText('+120 XP')
    await expect(page.locator('.run-rewards-bar-text')).toHaveText(
      'XP 420 / 900'
    )
    if (mode === 'training') await shot(page, '1-training')
    if (mode === 'territory') await shot(page, '2-conquer')
    if (mode === 'pvp') await shot(page, '3-pvp')
    // 3) image slide
    await next(page).click()
    await expect(page.getByRole('dialog', { name: 'Your run' })).toBeVisible()
    await expect(page.getByTestId('download-transparent')).toHaveText(
      'Download PNG'
    )
    // 4) Done
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    expect(await page.evaluate(() => window.__dismissed)).toBe(1)
  })
}

test('XP bar: fills from the OLD xp to the NEW xp, visibly (never empty)', async ({
  page,
}) => {
  await show(page, { run: RUN, mode: 'territory', xpReward: XP })
  const fill = page.locator('.run-rewards-bar-fill')
  const track = page.locator('.run-rewards-bar-track')
  await expect(fill).toBeVisible()
  const tw = (await track.boundingBox()).width
  // Old XP 300/900 = 33%: already visible when the bar first shows.
  const w0 = (await fill.boundingBox()).width
  expect(w0).toBeGreaterThan(6)
  await page.waitForTimeout(600)
  await shot(page, '7-xp-midway')
  await expect(next(page)).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(1000)
  const w1 = (await fill.boundingBox()).width
  // New XP 420/900 = 46.7%.
  expect(w1 / tw).toBeGreaterThan(0.4)
  expect(w1 / tw).toBeLessThan(0.55)
  expect(w1).toBeGreaterThan(w0)
})

test('Skip only fast-forwards the animation, then the image slide opens', async ({
  page,
}) => {
  await show(page, { run: RUN, mode: 'training', xpReward: XP })
  const skip = page.getByRole('button', { name: 'Skip', exact: true })
  await expect(skip).toBeVisible()
  await page.waitForTimeout(600) // card pop-in (scale) settles
  const box = await skip.boundingBox()
  expect(box.height).toBeGreaterThanOrEqual(44)
  await skip.click()
  // The image slide is NOT skipped: it is what opens.
  await expect(page.getByRole('dialog', { name: 'Your run' })).toBeVisible()
  await expect(page.getByTestId('download-transparent')).toBeVisible()
  expect(await page.evaluate(() => window.__dismissed || 0)).toBe(0)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  expect(await page.evaluate(() => window.__dismissed)).toBe(1)
})

test('tapping the backdrop jumps to the final values and keeps the popup', async ({
  page,
}) => {
  await show(page, { run: RUN, mode: 'territory', xpReward: XP })
  await page.mouse.click(5, 5)
  await expect(page.locator('.run-rewards-xp-chip')).toHaveText('+120 XP')
  await expect(page.locator('.run-rewards-bar-text')).toHaveText('XP 420 / 900')
  await expect(next(page)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Skip' })).toHaveCount(0)
  expect(await page.evaluate(() => window.__dismissed || 0)).toBe(0)
})

test('level-up variant: badge shows the new level, "Level 6!", bar on the new level', async ({
  page,
}) => {
  await show(page, { run: RUN, mode: 'territory', xpReward: LEVEL_UP })
  await expect(page.locator('.run-rewards-level-num')).toHaveText('5')
  await expect(page.getByText('Level 6!')).toBeVisible({ timeout: 5_000 })
  await expect(page.locator('.run-rewards-level-num')).toHaveText('6')
  await page.waitForTimeout(400)
  await shot(page, '4-level-up')
  await expect(next(page)).toBeVisible({ timeout: 10_000 })
  // New level: 100 / 1100 into level 6.
  await expect(page.locator('.run-rewards-bar-text')).toHaveText(
    'XP 100 / 1,100'
  )
  await expect(page.locator('.run-rewards-xp-chip')).toHaveText('+150 XP')
  await next(page).click()
  await expect(page.getByRole('dialog', { name: 'Your run' })).toBeVisible()
})

test('no-XP variant: friendly line, no XP bar, still continues to the image slide', async ({
  page,
}) => {
  await show(page, { run: RUN, mode: 'training' })
  await expect(page.getByText('Run a bit longer to earn XP')).toBeVisible()
  await expect(page.locator('.run-rewards-xp-chip')).toHaveCount(0)
  await expect(page.locator('.run-rewards-bar-track')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Skip' })).toHaveCount(0)
  await page.waitForTimeout(600) // pop-in settles
  await shot(page, '6-no-xp')
  await next(page).click()
  await expect(page.getByRole('dialog', { name: 'Your run' })).toBeVisible()
})

test('a run with no route and no XP shows nothing to continue to: Continue closes', async ({
  page,
}) => {
  await show(page, { run: { ...RUN, points: [] }, mode: 'training' })
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  expect(await page.evaluate(() => window.__dismissed)).toBe(1)
})

for (const w of [320, 360, 412]) {
  test(`long values (1:05:09, 125:30 /km, 12.45 km) fit at ${w}px; nothing spills`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: w, height: w === 360 ? 640 : 740 })
    await show(page, { run: LONG, mode: 'training', xpReward: XP })
    await expect(next(page)).toBeVisible({ timeout: 10_000 })
    const bad = await page.evaluate(() => {
      const card = document
        .querySelector('.run-rewards-panel')
        .getBoundingClientRect()
      const out = []
      for (const t of document.querySelectorAll('.gm-stat')) {
        const tr = t.getBoundingClientRect()
        const v = t.querySelector('.gm-stat-value')
        if (v.scrollWidth > v.clientWidth + 1)
          out.push(`clipped ${v.textContent}`)
        for (const c of t.children) {
          const r = c.getBoundingClientRect()
          if (r.left < tr.left - 1 || r.right > tr.right + 1)
            out.push(`spill ${c.className}`)
        }
      }
      for (const el of document.querySelectorAll('.run-rewards-panel *')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) continue
        if (r.left < card.left - 1 || r.right > card.right + 1)
          out.push(`outside ${el.className}`)
      }
      out.push(
        ...(document.documentElement.scrollWidth >
        document.documentElement.clientWidth
          ? ['page scrolls sideways']
          : [])
      )
      return out
    })
    expect(bad).toEqual([])
    // Label text is at least 12px.
    const label = await page
      .locator('.run-rewards-main .gm-stat-label')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    expect(label).toBeGreaterThanOrEqual(12)
    if (w === 320) await shot(page, '5-long-values-320')
    if (w === 360) await shot(page, '8-training-360')
  })
}

test('reduced motion: everything is already final, Next is there at once', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await show(page, { run: RUN, mode: 'territory', xpReward: LEVEL_UP })
  await expect(next(page)).toBeVisible({ timeout: 1_500 })
  await expect(page.locator('.run-rewards-xp-chip')).toHaveText('+150 XP')
  await expect(page.getByText('Level 6!')).toBeVisible()
})
