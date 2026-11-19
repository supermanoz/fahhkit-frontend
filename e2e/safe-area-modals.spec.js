import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'
import { test as plain, expect as plainExpect } from '@playwright/test'

// Big modals / sheets must start BELOW the status bar and end ABOVE the home
// indicator. Device insets are simulated with the same variables the app
// uses (index.css: --native-safe-top via SafeAreaPlugin on Android, env() on
// iOS -> --safe-top / --safe-bottom). Screenshots: ./screenshots/safe-area/.
const OUT = 'screenshots/safe-area'
const GAP = 8 // at least this far clear of the status bar / home indicator

const DEVICES = [
  { name: 'ios-dynamic-island', width: 393, height: 852, top: 59, bottom: 34 },
  { name: 'ios-notch-small', width: 360, height: 640, top: 47, bottom: 34 },
  { name: 'android-punch-hole', width: 360, height: 800, top: 32, bottom: 0 },
  { name: 'android-short', width: 360, height: 640, top: 28, bottom: 0 },
  { name: 'web', width: 390, height: 844, top: 0, bottom: 0 },
  { name: 'web-desktop', width: 1440, height: 900, top: 0, bottom: 0 },
]

async function simulateInsets(page, d) {
  await page.setViewportSize({ width: d.width, height: d.height })
  page.insets = d
}

// Set AFTER the page has loaded (an init script runs before <html> exists and
// its attribute/inline style would be wiped).
async function applyInsets(page) {
  const { top, bottom } = page.insets
  await page.evaluate(
    ({ top, bottom }) => {
      const root = document.documentElement
      if (top || bottom) {
        root.dataset.native = 'true' // same switch the native shell flips
        root.style.setProperty('--native-safe-top', `${top}px`)
        root.style.setProperty('--native-safe-bottom', `${bottom}px`)
      }
    },
    { top, bottom }
  )
}

// ---- hero detail card + the other overlay shells (harness page) -----------
plain.describe('big overlays clear the status bar and home indicator', () => {
  plain.setTimeout(120_000)
  const heroProps = (state) => ({
    hero: {
      id: 'hero-Nova',
      name: 'Nova',
      tagline: "The road doesn't care where you're from.",
      backstory:
        'Nobody in the canyon towns knew Nova’s real name, only the sound of her bike two seconds before they saw her. '.repeat(
          6
        ),
      limited: false,
      abilities: [{ id: 'a1', componentType: 'AREA', multiplier: 1.05 }],
      skins: [
        {
          id: 'item-Nova',
          category: 'HERO',
          name: 'Nova',
          heroId: 'hero-Nova',
          priceFahhcoin: 0,
          unlockLevel: 5,
        },
      ],
    },
    ownedItems: [],
    activeHeroId: 'someone-else',
    isActive: false,
    level: state === 'level-locked' ? 1 : 10,
  })

  for (const d of DEVICES) {
    plain(`hero card @${d.name}`, async ({ page }, testInfo) => {
      plain.skip(testInfo.project.name !== 'mobile-390', 'harness runs once')
      await simulateInsets(page, d)
      await page.goto('/e2e/previews/hero-card.html')
      await page.waitForFunction(() => window.__ready)
      await applyInsets(page)
      await page.evaluate((p) => window.__show(p), heroProps('level-locked'))
      await plainExpect(page.getByRole('dialog')).toBeVisible()
      await page.waitForTimeout(1100)

      const vp = page.viewportSize()
      const card = await page.getByRole('dialog').boundingBox()
      // Top edge below the status bar (+ gap), bottom above the home indicator.
      plainExpect(card.y).toBeGreaterThanOrEqual(d.top + GAP)
      plainExpect(card.y + card.height).toBeLessThanOrEqual(
        vp.height - d.bottom - GAP + 0.5
      )
      // Close (X) and arrows live INSIDE the visible card.
      const x = await page.locator('.hero-modal-close').boundingBox()
      plainExpect(x.y).toBeGreaterThanOrEqual(card.y)
      plainExpect(x.y).toBeGreaterThanOrEqual(d.top)
      plainExpect(x.x + x.width).toBeLessThanOrEqual(card.x + card.width + 0.5)
      for (const arrow of await page.locator('.hero-emote-arrow').all()) {
        const a = await arrow.boundingBox()
        plainExpect(a.x).toBeGreaterThanOrEqual(card.x)
        plainExpect(a.x + a.width).toBeLessThanOrEqual(
          card.x + card.width + 0.5
        )
        plainExpect(a.y).toBeGreaterThanOrEqual(card.y)
      }
      // The sticky action bar stays reachable above the home indicator.
      const bar = await page.locator('.hero-modal-actionbar').boundingBox()
      plainExpect(bar.y + bar.height).toBeLessThanOrEqual(
        vp.height - d.bottom - GAP + 0.5
      )
      plainExpect(bar.y).toBeGreaterThan(card.y)
      // The art area is a clamp of the viewport, not a fixed block.
      const stage = await page.locator('.hero-modal-stage').boundingBox()
      plainExpect(stage.height).toBeLessThanOrEqual(
        Math.min(0.38 * vp.height, 340) + 1
      )
      // Name + the unlock/equip button are both on screen at once on phones.
      const name = await page.locator('.hero-modal-name').boundingBox()
      plainExpect(name.y + name.height).toBeLessThanOrEqual(bar.y)
      await page.screenshot({ path: `${OUT}/hero-${d.name}.png` })
    })
  }

  // Shell checks: the card of each big overlay, with content far taller than
  // the screen, must stay inside [top inset + gap, height - bottom inset - gap]
  // and scroll internally.
  const SHELLS = [
    {
      name: 'game-confirm-overlay (run viewer, hero, coin shop...)',
      html: `<div class="game-confirm-overlay"><div id="card" style="width:100%;max-width:380px;max-height:var(--modal-max-h);overflow:auto;background:#fff"><div style="height:3000px">x</div></div></div>`,
    },
    {
      name: 'Modal (g-modal-scrim)',
      html: `<div class="g-modal-scrim"><div id="card" class="g-panel g-modal"><div class="g-modal-body"><div style="height:3000px">x</div></div></div></div>`,
    },
    {
      name: 'run rewards',
      html: `<div class="run-rewards-backdrop"><div id="card" class="run-rewards-card"><div style="height:3000px">x</div></div></div>`,
    },
    {
      name: 'terms / privacy overlay',
      html: `<div class="game-legal-overlay"><div id="card" class="game-legal-panel is-page"><div class="game-legal-scroll"><div style="height:3000px">x</div></div></div></div>`,
    },
  ]
  for (const shell of SHELLS) {
    for (const d of [DEVICES[0], DEVICES[3], DEVICES[4]]) {
      plain(`${shell.name} @${d.name}`, async ({ page }, testInfo) => {
        plain.skip(testInfo.project.name !== 'mobile-390', 'harness runs once')
        await simulateInsets(page, d)
        await page.goto('/e2e/previews/hero-card.html')
        await page.waitForFunction(() => window.__ready)
        await applyInsets(page)
        await page.evaluate((html) => {
          document.getElementById('root').innerHTML = html
        }, shell.html)
        await page.waitForTimeout(450) // pop-in animation
        const vp = page.viewportSize()
        const card = await page.locator('#card').boundingBox()
        const minTop = Math.max(d.top + GAP, 12)
        plainExpect(card.y).toBeGreaterThanOrEqual(minTop - 0.5)
        plainExpect(card.y + card.height).toBeLessThanOrEqual(
          vp.height - d.bottom - GAP + 0.5
        )
      })
    }
  }
})

// ---- the real run image popup + the Shop sheet in the game ----------------
const POINTS = Array.from({ length: 40 }, (_, i) => {
  const t = (i / 39) * Math.PI * 2
  return {
    lat: 27.7172 + Math.sin(t) * 0.0025,
    lng: 85.324 + Math.cos(t) * 0.0032,
  }
})
const RUN = {
  id: 'run-1',
  distance: 5200,
  duration: 1800,
  avgPace: 346,
  startedAt: '2026-11-01T06:30:00',
  points: POINTS,
}

for (const d of [DEVICES[0], DEVICES[3]]) {
  test(`in-game popups + sheet clear the status bar @${d.name}`, async ({
    mockedPage: page,
    context,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390', 'one project is enough')
    test.setTimeout(180_000)
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
    await seedSession(page, VETERAN)
    await simulateInsets(page, d)
    await page.addLocatorHandler(page.locator('.idle-nudge-backdrop'), () =>
      page.getByText('Not now').click()
    )
    await page.route('**/v1/run/find', (r) =>
      r.fulfill(
        ok({
          content: [RUN],
          totalElements: 1,
          totalPages: 1,
          number: 0,
          size: 10,
        })
      )
    )
    await page.route(/\/v1\/run\/run-1$/, (r) => r.fulfill(ok(RUN)))
    await page.goto('/game')
    await expect(page.locator('.game-hud-level')).toBeVisible({
      timeout: 90_000,
    })
    await applyInsets(page)

    // Menu sheet (Me tab): its X and tabs start below the status bar.
    await page.locator('.game-menu-btn').click()
    await page.getByRole('button', { name: 'Me', exact: true }).click()
    const close = await page.locator('.game-menu-close').boundingBox()
    expect(close.y).toBeGreaterThanOrEqual(d.top)
    await page.screenshot({ path: `${OUT}/menu-sheet-${d.name}.png` })

    // Run image popup.
    await page.locator('.game-me-history-row').first().click()
    await expect(page.locator('.share-carousel')).toBeVisible()
    await page.waitForTimeout(700)
    const vp = page.viewportSize()
    const x = await page.locator('.game-run-viewer-close').boundingBox()
    expect(x.y).toBeGreaterThanOrEqual(d.top + 2)
    const viewer = await page.locator('.game-run-viewer').boundingBox()
    expect(viewer.y).toBeGreaterThanOrEqual(d.top + GAP)
    const dl = await page.getByTestId('download-transparent').boundingBox()
    expect(dl.y + dl.height).toBeLessThanOrEqual(
      vp.height - d.bottom - GAP + 0.5
    )
    await page.screenshot({ path: `${OUT}/run-image-${d.name}.png` })
  })
}
