import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'

// Renders e2e/previews/notifications.html (hand-built previews of the
// Android/iOS notifications - NOT device captures) and saves one PNG per
// state to screenshots/notifications/. No app server needed.
const here = path.dirname(fileURLToPath(import.meta.url))
const page_url = 'file://' + path.join(here, 'previews', 'notifications.html')
const IDS = [
  'running',
  'running-start',
  'paused',
  'gps-lost',
  'service-default',
  'run-finished',
  'reminders',
  'broadcast',
  'ios',
]

test('notification previews render', async ({ page }) => {
  await page.setViewportSize({ width: 440, height: 900 })
  await page.goto(page_url)
  await page.evaluate(() => document.fonts.ready)
  for (const id of IDS) {
    const card = page.locator(`[data-id="${id}"]`)
    await expect(card).toBeVisible()
    await card.screenshot({
      path: `screenshots/notifications/preview-${id}.png`,
    })
  }
  await page.screenshot({
    path: 'screenshots/notifications/preview-all.png',
    fullPage: true,
  })
})
