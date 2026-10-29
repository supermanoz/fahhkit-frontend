// Captures /game's reachable-without-login screens plus the dev-only style
// guide, at both required reference sizes, for docs/ui-revamp/compare/.
// Logged-in screens (HUD, map, shop, club, etc.) need a real authenticated
// session this script doesn't have - capture those by hand against a
// logged-in session when verifying a change.
import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'

const OUT = new URL('../docs/ui-revamp/compare/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const sizes = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1440x900', width: 1440, height: 900 },
]

const browser = await chromium.launch()

for (const size of sizes) {
  const page = await browser.newPage({
    viewport: { width: size.width, height: size.height },
    ignoreHTTPSErrors: true,
  })

  await page.goto('https://localhost:5173/game', { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}after-00-welcome-${size.name}.png` })

  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}after-01-signin-${size.name}.png` })

  await page.goto('https://localhost:5173/game', { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Create Account' }).click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}after-02-signup-${size.name}.png`, fullPage: true })

  await page.goto('https://localhost:5173/game/style-guide', { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}after-03-style-guide-${size.name}.png`, fullPage: true })

  await page.close()
}

await browser.close()
console.log('done ->', OUT)
