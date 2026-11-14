import {
  test,
  expect,
  seedSession,
  expectNoHorizontalScroll,
} from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'

// The top HUD (level badge, coins) and full-screen panel headers must clear
// the phone status bar / notch in the native app, and stay exactly where they
// were on the web. Screenshots: ./screenshots/hud-safe-area/.
//
// Simulation notes (this Playwright's Chromium 131 has no safe-area override):
// - "device env() inset" is mirrored by re-declaring --safe-top with the SAME
//   formula index.css uses, env() replaced by the simulated number.
// - "native" is Capacitor's Android bridge stub (window.androidBridge), like
//   native-shell.spec.js. With no native side the SafeArea plugin call can't
//   answer, so the app's 28px fallback applies; "plugin reports N" is
//   simulated by setting --native-safe-top to N afterwards, exactly what
//   safeArea.js does with the plugin's answer.
const SHOT_DIR = 'screenshots/hud-safe-area'

// The loading overlay (poster, then the intro globe) is absent before it
// first mounts, so toBeHidden()/count 0 can pass while the poster is about to
// appear - earlier runs screenshotted the poster. Require it to stay gone
// for 3 consecutive seconds, then the HUD to be visible.
async function waitForGame(page) {
  const overlay = page.locator('.game-loading-overlay')
  let goneSince = null
  await expect
    .poll(
      async () => {
        if ((await overlay.count()) > 0) {
          goneSince = null
          return false
        }
        goneSince ??= Date.now()
        return Date.now() - goneSince >= 3000
      },
      { timeout: 90_000, intervals: [500] }
    )
    .toBe(true)
  await expect(page.locator('.game-hud-level')).toBeVisible({ timeout: 20_000 })
}

const CASES = [
  {
    name: 'ios-notch-390x844-inset47',
    viewport: { width: 390, height: 844 },
    native: true,
    envTop: 47,
    safeTop: 47, // max(env 47, fallback 28)
  },
  {
    name: 'android-24-status-bar',
    viewport: { width: 390, height: 844 },
    native: true,
    envTop: 0,
    pluginTop: 24,
    safeTop: 24,
  },
  {
    name: 'android-plugin-missing-fallback',
    viewport: { width: 390, height: 844 },
    native: true,
    envTop: 0,
    safeTop: 28,
  },
  {
    name: 'web-no-inset',
    viewport: { width: 390, height: 844 },
    native: false,
    envTop: 0,
    safeTop: 0,
  },
]

for (const c of CASES) {
  test.describe(c.name, () => {
    test.use({ viewport: c.viewport })

    test.beforeEach(async ({ mockedPage: page, context }) => {
      await context.grantPermissions(['geolocation'])
      await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
      await page.addInitScript(
        ({ native, envTop }) => {
          if (native) {
            window.androidBridge = { postMessage() {} }
            window.addEventListener('unhandledrejection', (e) => {
              if (/not implemented on android/.test(e.reason?.message || ''))
                e.preventDefault()
            })
          }
          // Same formulas as src/index.css with env(safe-area-inset-top)
          // replaced by the simulated device inset.
          const css = `:root{--safe-top:${envTop}px}
:root[data-native='true']{--safe-top:max(${envTop}px,var(--native-safe-top,28px))}`
          const add = () => {
            const s = document.createElement('style')
            s.textContent = css
            document.head.appendChild(s)
          }
          if (document.head) add()
          else document.addEventListener('DOMContentLoaded', add)
        },
        { native: c.native, envTop: c.envTop }
      )
      await seedSession(page, VETERAN)
    })

    test('HUD clears the status bar and stays aligned', async ({
      mockedPage: page,
    }) => {
      await page.goto('/game')
      await waitForGame(page)
      if (c.pluginTop != null) {
        await page.evaluate((n) => {
          document.documentElement.style.setProperty(
            '--native-safe-top',
            `${n}px`
          )
        }, c.pluginTop)
      }
      const level = page.locator('.game-hud-level')
      const coins = page.locator('.game-hud')
      // The badge appears once the profile fetch lands, a bit after the
      // loading overlay clears.
      await expect(level).toBeVisible({ timeout: 20_000 })
      await expect(coins).toBeVisible()

      const lb = await level.boundingBox()
      const cb = await coins.boundingBox()
      const expectedTop = c.safeTop + 16
      // Both pinned to the shared --hud-top: 16px on web (unchanged), the
      // inset + 16px natively - never under the status bar.
      expect(Math.abs(lb.y - expectedTop)).toBeLessThanOrEqual(1)
      expect(Math.abs(cb.y - expectedTop)).toBeLessThanOrEqual(1)
      expect(lb.y).toBeGreaterThanOrEqual(c.safeTop)
      // Same row: badge and coin counter vertically centred together.
      expect(
        Math.abs(lb.y + lb.height / 2 - (cb.y + cb.height / 2))
      ).toBeLessThanOrEqual(4)
      // Coins stay inside the right edge (no horizontal overflow).
      expect(cb.x + cb.width).toBeLessThanOrEqual(c.viewport.width)
      await expectNoHorizontalScroll(page)
      await page.screenshot({ path: `${SHOT_DIR}/${c.name}-hud.png` })
    })

    test('menu panel header clears the status bar', async ({
      mockedPage: page,
    }) => {
      await page.goto('/game')
      await waitForGame(page)
      if (c.pluginTop != null) {
        await page.evaluate((n) => {
          document.documentElement.style.setProperty(
            '--native-safe-top',
            `${n}px`
          )
        }, c.pluginTop)
      }
      await page.locator('.game-menu-btn').click()
      const TABS = ['Shop', 'Club', 'Leaderboard', 'Mail', 'Settings']
      for (const tab of TABS) {
        if (tab === TABS[0]) {
          // First tab: pick it from the radial menu.
          await page.getByRole('button', { name: tab, exact: true }).click()
        } else {
          // Phones switch tabs through the picker; the tab row is
          // display:none there (and the reverse on desktop widths).
          const picker = page.locator('.game-menu-picker-current')
          if (await picker.isVisible()) {
            await picker.click()
            await page
              .locator('.game-menu-picker-option')
              .filter({ hasText: tab })
              .click()
          } else {
            await page
              .locator('.game-menu-tab')
              .filter({ hasText: tab })
              .click()
          }
        }
        const sheet = page.locator('.game-menu-sheet')
        await expect(sheet).toBeVisible()
        // The sheet springs up from y:100%; measuring mid-animation made the
        // old assertions pass/fail on timing. Wait until it has settled.
        await expect
          .poll(async () => (await sheet.boundingBox()).y, { timeout: 5000 })
          .toBe(0)
        const close = await page
          .locator('.game-menu-close')
          .first()
          .boundingBox()
        // Phones show .game-menu-picker-current; the .game-menu-tab row is
        // display:none there (it only exists on desktop widths).
        const header = await page
          .locator('.game-menu-picker-current:visible, .game-menu-tab:visible')
          .first()
          .boundingBox()
        // Close button + header sit below the status bar (web: unchanged).
        // Phones perch the X 2px above the picker bar (web: y=2, unchanged),
        // so natively it is safeTop + 2 - never under the status bar.
        expect(close.y).toBeGreaterThanOrEqual(c.safeTop + 2 - 0.5)
        expect(close.y).toBeLessThanOrEqual(c.safeTop + 10)
        expect(header.y).toBeGreaterThanOrEqual(c.safeTop + 13)
        // Close button is fully on screen and is what a tap at its centre
        // would actually hit (nothing painted over it).
        expect(close.x + close.width).toBeLessThanOrEqual(c.viewport.width)
        const hit = await page.evaluate(
          ({ x, y }) => {
            const el = document.elementFromPoint(x, y)
            return !!el?.closest('.game-menu-close')
          },
          { x: close.x + close.width / 2, y: close.y + close.height / 2 }
        )
        expect(hit).toBe(true)
        await page.screenshot({
          path: `${SHOT_DIR}/${c.name}-menu-${tab.toLowerCase()}.png`,
        })
      }
    })
  })
}

// ---- Landscape / bottom insets -------------------------------------------
// Chromium has no safe-area override, so env(safe-area-inset-*) in the page's
// own <style> tags is rewritten to the simulated numbers (what iOS reports in
// landscape on a notch phone / with the home indicator).
const EDGE_CASES = [
  {
    name: 'ios-landscape-844x390-notch',
    viewport: { width: 844, height: 390 },
    insets: { top: 0, left: 47, right: 47, bottom: 21 },
  },
  {
    name: 'ios-portrait-390x844-home-indicator',
    viewport: { width: 390, height: 844 },
    insets: { top: 47, left: 0, right: 0, bottom: 34 },
  },
]

for (const c of EDGE_CASES) {
  test.describe(c.name, () => {
    test.use({ viewport: c.viewport })

    test.beforeEach(async ({ mockedPage: page, context }) => {
      await context.grantPermissions(['geolocation'])
      await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
      await page.addInitScript((ins) => {
        window.androidBridge = { postMessage() {} }
        window.addEventListener('unhandledrejection', (e) => {
          if (/not implemented on android/.test(e.reason?.message || ''))
            e.preventDefault()
        })
        const fix = (el) => {
          if (el.tagName !== 'STYLE' || el.dataset.envFixed) return
          const t = el.textContent || ''
          if (!t.includes('env(')) return
          el.dataset.envFixed = '1'
          el.textContent = t.replace(
            /env\(safe-area-inset-(top|left|right|bottom)(?:\s*,\s*0px)?\)/g,
            (_, side) => `${ins[side]}px`
          )
        }
        const scan = () => document.querySelectorAll('style').forEach(fix)
        new MutationObserver(scan).observe(document, {
          childList: true,
          subtree: true,
          characterData: true,
        })
        document.addEventListener('DOMContentLoaded', scan)
      }, c.insets)
      await seedSession(page, VETERAN)
    })

    test('HUD, run panel and buttons clear the notch and home indicator', async ({
      mockedPage: page,
    }) => {
      const { width: W, height: H } = c.viewport
      const { left, right, bottom } = c.insets
      await page.goto('/game')
      await waitForGame(page)
      const level = page.locator('.game-hud-level')
      await expect(level).toBeVisible({ timeout: 20_000 })
      const lb = await level.boundingBox()
      const cb = await page.locator('.game-hud').boundingBox()
      expect(lb.x).toBeGreaterThanOrEqual(left)
      expect(cb.x + cb.width).toBeLessThanOrEqual(W - right)
      expect(lb.y).toBeGreaterThanOrEqual(c.insets.top)
      // Bottom: nothing interactive sits inside the home-indicator band.
      for (const sel of [
        '.game-menu-btn',
        '.game-locate-btn',
        '.territory-map-locate',
        '.territory-map-attribution-anchor',
      ]) {
        const loc = page.locator(sel).first()
        if (!(await loc.isVisible().catch(() => false))) continue
        const b = await loc.boundingBox()
        expect(b.y + b.height, sel).toBeLessThanOrEqual(H - bottom)
        expect(b.x, sel).toBeGreaterThanOrEqual(left)
        expect(b.x + b.width, sel).toBeLessThanOrEqual(W - right)
      }
      // Run panel: its content is padded clear of the bar and the notch.
      const pad = await page
        .locator('.game-controls')
        .first()
        .evaluate((el) => {
          const cs = getComputedStyle(el)
          return {
            b: parseFloat(cs.paddingBottom),
            l: parseFloat(cs.paddingLeft),
            r: parseFloat(cs.paddingRight),
          }
        })
      expect(pad.b).toBeGreaterThanOrEqual(bottom)
      expect(pad.l).toBeGreaterThanOrEqual(left)
      expect(pad.r).toBeGreaterThanOrEqual(right)
      await expectNoHorizontalScroll(page)
      await page.screenshot({ path: `${SHOT_DIR}/${c.name}-hud.png` })

      // Menu sheet: close button + content clear of the side insets.
      await page.locator('.game-menu-btn').click()
      await page.getByRole('button', { name: 'Shop', exact: true }).click()
      const sheet = page.locator('.game-menu-sheet')
      await expect(sheet).toBeVisible()
      await expect
        .poll(async () => (await sheet.boundingBox()).y, { timeout: 5000 })
        .toBe(0)
      const close = await page.locator('.game-menu-close').first().boundingBox()
      expect(close.x + close.width).toBeLessThanOrEqual(W - right)
      expect(close.y).toBeGreaterThanOrEqual(c.insets.top)
      await page.screenshot({ path: `${SHOT_DIR}/${c.name}-menu.png` })
    })
  })
}
