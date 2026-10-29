// Post-transparency-fix screenshots at 390x844 of the reachable-without-
// login /game screens, for docs/ui-revamp/remove-transparency/. Logged-in
// menus (Leaderboard/Club/Mail/Me/Shop/Settings/PvP/territory popup/run
// panel) were verified live via an authenticated Claude-in-Chrome session
// instead - see those screenshots in the same folder, prefixed "live-".
import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'

const OUT = new URL('../docs/ui-revamp/remove-transparency/', import.meta.url)
  .pathname
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

await page.close()
await browser.close()
console.log('done ->', OUT)
