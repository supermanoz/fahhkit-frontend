// Post-CoC-palette screenshots at 390x844 of the reachable-without-login
// /game screens + the dev-only style guide. Logged-in screens (Leaderboard/
// Shop/Me/Mail/Settings/announcement/territory popup/run panel) need a real
// authenticated session this script doesn't have - verify those by hand.
import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'

const OUT = new URL('../docs/ui-revamp/coc-palette/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  ignoreHTTPSErrors: true,
})

await page.goto('https://localhost:5173/game', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}after-00-welcome-390x844.png` })

await page.getByRole('button', { name: 'Sign In', exact: true }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}after-01-signin-390x844.png` })

await page.goto('https://localhost:5173/game', { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await page.getByRole('button', { name: 'Create Account' }).click()
await page.waitForTimeout(400)
await page.screenshot({
  path: `${OUT}after-02-signup-390x844.png`,
  fullPage: true,
})

await page.goto('https://localhost:5173/game/style-guide', {
  waitUntil: 'networkidle',
})
await page.waitForTimeout(500)
await page.screenshot({
  path: `${OUT}after-03-style-guide-390x844.png`,
  fullPage: true,
})

await page.close()
await browser.close()
console.log('done ->', OUT)
