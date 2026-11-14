import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// The HUD (map) hero plays the equipped emote instead of idling. Mocked API.
// Checks per hero: emote plays (idle hidden), Classic / hidden emotes fall
// back to idle, feet + size match the idle sprite, the animation pauses while
// the menu covers the HUD, and equipping another emote in the Shop updates it
// live. Screenshots: ./screenshots/hud-emote/.
const SHOT_DIR = 'screenshots/hud-emote'
const HERO_NAMES = [
  'Blaze',
  'Bolt',
  'Comet',
  'Cyclone',
  'Nova',
  'Phantom',
  'Pulse',
]
const EMOTES = ['Classic', 'Emote2', 'Emote3', 'Emote4', 'Emote5']

function hero(name) {
  const id = `hero-${name.toLowerCase()}-id`
  return {
    id,
    name,
    tagline: 'x',
    backstory: 'x',
    limited: false,
    abilities: [],
    skins: [
      {
        id: `item-hero-${name.toLowerCase()}`,
        category: 'HERO',
        name,
        heroId: id,
        priceFahhcoin: 0,
        assetUrl: null,
      },
      ...EMOTES.map((e) => ({
        id: `item-${name.toLowerCase()}-${e.toLowerCase()}`,
        category: 'EMOTE',
        name: e,
        heroId: id,
        priceFahhcoin: 0,
        assetUrl: null,
      })),
    ],
  }
}
const HEROES = HERO_NAMES.map(hero)
const allItems = HEROES.flatMap((h) => h.skins)
const byId = (id) => allItems.find((i) => i.id === id)

let rows
async function setup(page, context, heroName, equippedEmote, ownedEmotes = []) {
  const h = heroName.toLowerCase()
  rows = [
    { id: 'o-hero', storeItem: byId(`item-hero-${h}`), equipped: true },
    ...[equippedEmote, ...ownedEmotes].map((e, i) => ({
      id: `o-${e}`,
      storeItem: byId(`item-${h}-${e.toLowerCase()}`),
      equipped: i === 0,
    })),
  ]
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  await seedSession(page, VETERAN)
  await page.route('**/v1/store/heroes/find', (r) =>
    r.fulfill(ok({ content: HEROES, totalElements: HEROES.length }))
  )
  await page.route(/\/v1\/store\/heroes\/(?!find$)[^/]+$/, (r) => {
    const id = r.request().url().split('/').pop()
    return r.fulfill(ok(HEROES.find((x) => x.id === id) || null))
  })
  await page.route('**/v1/store/owned', (r) => r.fulfill(ok(rows)))
  await page.route('**/v1/store/equipped', (r) =>
    r.fulfill(ok(rows.filter((o) => o.equipped)))
  )
  await page.route(/\/v1\/store\/[^/]+\/equip$/, (r) => {
    const id = r.request().url().split('/').slice(-2)[0]
    const row = rows.find((x) => x.storeItem.id === id)
    rows = rows.map((x) =>
      x.storeItem.category === row.storeItem.category &&
      (row.storeItem.category === 'HERO' ||
        x.storeItem.heroId === row.storeItem.heroId)
        ? { ...x, equipped: x === row }
        : x
    )
    return r.fulfill(ok({}))
  })
  await page.goto('/game')
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 60_000,
  })
  // A daily-run reminder can pop over the HUD depending on the clock.
  await page
    .getByText('Not now')
    .click({ timeout: 4000 })
    .catch(() => {})
}

// Feet (lowest opaque pixel row, horizontal centre) and character height, in
// CSS px, of the idle sprite (frame 0 of its map sheet) and of the emote
// canvas right now.
const measure = (page) =>
  page.evaluate(async () => {
    const bbox = (ctx, w, h) => {
      const d = ctx.getImageData(0, 0, w, h).data
      let x0 = w,
        x1 = 0,
        y0 = h,
        y1 = 0
      for (let y = 0; y < h; y += 1)
        for (let x = 0; x < w; x += 1)
          if (d[(y * w + x) * 4 + 3] > 20) {
            if (x < x0) x0 = x
            if (x > x1) x1 = x
            if (y < y0) y0 = y
            y1 = y
          }
      return { x0, x1, y0, y1 }
    }
    const out = {}
    const idle = document.querySelector('.territory-map-blaze')
    if (idle) {
      const url =
        getComputedStyle(idle).backgroundImage.match(/url\("?(.*?)"?\)/)[1]
      const img = await new Promise((res) => {
        const i = new Image()
        i.onload = () => res(i)
        i.src = url
      })
      const fh = img.naturalHeight
      const fw = Math.round(img.naturalWidth / Number(idle.dataset.frames))
      const c = document.createElement('canvas')
      c.width = fw
      c.height = fh
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0, fw, fh, 0, 0, fw, fh)
      const b = bbox(ctx, fw, fh)
      const r = idle.getBoundingClientRect()
      const sy = r.height / fh
      out.idle = {
        feetY: r.top + (b.y1 + 1) * sy,
        topY: r.top + b.y0 * sy,
        cx: r.left + (r.width * (b.x0 + b.x1 + 1)) / 2 / fw,
      }
    }
    const cv = document.querySelector('.territory-map-hud-emote canvas')
    if (cv) {
      const b = bbox(cv.getContext('2d'), cv.width, cv.height)
      const r = cv.getBoundingClientRect()
      const sy = r.height / cv.height
      out.emote = {
        feetY: r.top + (b.y1 + 1) * sy,
        topY: r.top + b.y0 * sy,
        cx: r.left + (r.width * (b.x0 + b.x1 + 1)) / 2 / cv.width,
        rect: { top: r.top, left: r.left, bottom: r.bottom, right: r.right },
        fw: cv.width,
      }
    }
    return out
  })

const emoting = (page) => page.locator('.territory-map-blaze-body.is-emoting')
async function shotMarker(page, testInfo, name) {
  // The idle nudge can pop over the HUD after a few quiet seconds.
  await page
    .getByText('Not now')
    .click({ timeout: 500 })
    .catch(() => {})
  await page.waitForTimeout(500)
  const box = await page.locator('.territory-map-blaze-icon').boundingBox()
  const clip = {
    x: Math.max(0, box.x - 90),
    y: Math.max(0, box.y - 70),
    width: 270,
    height: 220,
  }
  await page.screenshot({
    path: `${SHOT_DIR}/${name}-${testInfo.project.name}.png`,
    clip,
  })
}

test.describe('HUD hero plays the equipped emote', () => {
  // Emote art per hero: a dance/other emote that is visible (not hidden).
  const PLAYS = [
    ['Blaze', 'Emote2'],
    ['Bolt', 'Emote5'],
    ['Comet', 'Emote3'],
    ['Cyclone', 'Emote3'],
    ['Nova', 'Emote2'],
    ['Phantom', 'Emote3'],
    ['Pulse', 'Emote2'],
  ]
  for (const [heroName, emote] of PLAYS) {
    test(`${heroName} + ${emote}: plays, same feet/size as idle`, async ({
      mockedPage: page,
      context,
    }, testInfo) => {
      test.setTimeout(120_000)
      await setup(page, context, heroName, emote)
      await expect(emoting(page)).toHaveCount(1, { timeout: 30_000 })
      await page.waitForTimeout(400)
      const m = await measure(page)
      testInfo.annotations.push({
        type: 'feet',
        description: JSON.stringify({
          idleFeet: m.idle.feetY,
          emoteFeet: m.emote.feetY,
          idleH: m.idle.feetY - m.idle.topY,
          emoteH: m.emote.feetY - m.emote.topY,
          dx: m.emote.cx - m.idle.cx,
        }),
      })
      // Same floor as idle (a few px of authored motion allowed), centred on
      // the same X, and the character roughly idle's size.
      expect(Math.abs(m.emote.feetY - m.idle.feetY)).toBeLessThan(6)
      expect(Math.abs(m.emote.cx - m.idle.cx)).toBeLessThan(14)
      const idleH = m.idle.feetY - m.idle.topY
      expect(m.emote.feetY - m.emote.topY).toBeGreaterThan(idleH * 0.6)
      expect(m.emote.feetY - m.emote.topY).toBeLessThan(idleH * 1.3)
      // Fully on screen.
      const vp = page.viewportSize()
      expect(m.emote.rect.top).toBeGreaterThanOrEqual(0)
      expect(m.emote.rect.bottom).toBeLessThanOrEqual(vp.height)
      expect(m.emote.rect.left).toBeGreaterThanOrEqual(0)
      expect(m.emote.rect.right).toBeLessThanOrEqual(vp.width)
      await shotMarker(
        page,
        testInfo,
        `${heroName.toLowerCase()}-${emote.toLowerCase()}`
      )
    })
  }

  test('Classic and hidden emotes fall back to idle', async ({
    mockedPage: page,
    context,
  }, testInfo) => {
    test.setTimeout(120_000)
    await setup(page, context, 'Blaze', 'Classic')
    await page.waitForTimeout(3000)
    await expect(emoting(page)).toHaveCount(0)
    await expect(page.locator('.territory-map-hud-emote')).toHaveCount(0)
    await shotMarker(page, testInfo, 'blaze-classic-idle')
  })

  test('hidden emote (Comet Emote2) falls back to idle', async ({
    mockedPage: page,
    context,
  }, testInfo) => {
    test.setTimeout(120_000)
    await setup(page, context, 'Comet', 'Emote2')
    await page.waitForTimeout(3000)
    await expect(emoting(page)).toHaveCount(0)
    await expect(page.locator('.territory-map-hud-emote')).toHaveCount(0)
    await shotMarker(page, testInfo, 'comet-hidden-emote2-idle')
  })

  test('animates, pauses under the menu, resumes', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(120_000)
    await setup(page, context, 'Comet', 'Emote3')
    await expect(emoting(page)).toHaveCount(1, { timeout: 30_000 })
    const hash = () =>
      page.evaluate(() => {
        const cv = document.querySelector('.territory-map-hud-emote canvas')
        return cv.toDataURL().length + ':' + cv.toDataURL().slice(-60)
      })
    const run = new Set()
    // Emotes can hold a pose for a moment: sample for up to ~5s until a
    // second distinct frame shows up instead of a fixed 0.9s window.
    for (let i = 0; i < 33 && run.size < 2; i += 1) {
      run.add(await hash())
      await page.waitForTimeout(150)
    }
    expect(run.size).toBeGreaterThan(1)
    await page.locator('.game-menu-btn').click()
    await page.getByRole('button', { name: 'Me', exact: true }).click()
    await expect(page.locator('.game-menu-sheet')).toBeVisible()
    await page.waitForTimeout(300)
    const a = await hash()
    await page.waitForTimeout(600)
    expect(await hash()).toBe(a)
    await page.getByRole('button', { name: 'Close' }).first().click()
    const after = new Set()
    for (let i = 0; i < 8; i += 1) {
      after.add(await hash())
      await page.waitForTimeout(150)
    }
    expect(after.size).toBeGreaterThan(1)
  })

  test('equipping another emote in the Shop updates the HUD live', async ({
    mockedPage: page,
    context,
  }, testInfo) => {
    test.setTimeout(150_000)
    await setup(page, context, 'Blaze', 'Emote2', ['Emote3'])
    await expect(emoting(page)).toHaveCount(1, { timeout: 30_000 })
    const w1 = (await measure(page)).emote.fw
    await page.locator('.game-menu-btn').click()
    await page.getByRole('button', { name: 'Shop', exact: true }).click()
    await page.getByRole('button', { name: 'Blaze - view details' }).click()
    const d = page.getByRole('dialog', { name: 'Blaze' })
    // Walk the emote slider to Emote3 and equip it.
    const card = page.locator('.emote-showcase-card')
    for (let i = 0; i < 6; i += 1) {
      await expect(d.locator('.hero-emote-slide')).toHaveCount(1)
      await d.locator('.hero-emote-slide').click()
      if ((await card.getAttribute('aria-label')) === 'Emote3') {
        await card.getByRole('button', { name: 'Equip', exact: true }).click()
        break
      }
      await page.locator('.emote-showcase-close').click()
      await page.keyboard.press('ArrowRight')
    }
    await expect(card).toBeHidden()
    await d.getByRole('button', { name: 'Close' }).click()
    await page.getByRole('button', { name: 'Close' }).first().click()
    await expect
      .poll(async () => (await measure(page)).emote?.fw, { timeout: 30_000 })
      .not.toBe(w1)
    await expect(emoting(page)).toHaveCount(1)
    await shotMarker(page, testInfo, 'live-switched')
  })
})
