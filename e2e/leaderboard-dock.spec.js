import { test, expect } from '@playwright/test'

// The leaderboard's "You" row is a docked FOOTER: a sibling after the one
// scrolling element (.lb-panel), never inside it and never sticky/fixed.
// Rendered through e2e/previews/leaderboard-dock.html (same structure as
// GamePage's sheet). Screenshots: ./screenshots/leaderboard-dock/.
const SHOT_DIR = 'screenshots/leaderboard-dock'

for (const board of ['players', 'clubs']) {
  test(`${board}: list scrolls, You row stays docked and never overlaps a row`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/e2e/previews/leaderboard-dock.html?s=${board}`)
    await expect(page).toHaveTitle('ready')

    const panel = page.locator('.lb-panel')
    const dock = page.locator('.lb-dock')

    // Structure: dock is a sibling AFTER the panel, in normal flow.
    const structure = await page.evaluate(() => {
      const panel = document.querySelector('.lb-panel')
      const dock = document.querySelector('.lb-dock')
      const cs = getComputedStyle(dock)
      return {
        sibling: panel.nextElementSibling === dock,
        insidePanel: panel.contains(dock),
        position: cs.position,
        transform: cs.transform,
        shadow: cs.boxShadow,
        panelOverflowY: getComputedStyle(panel).overflowY,
      }
    })
    expect(structure.sibling).toBe(true)
    expect(structure.insidePanel).toBe(false)
    expect(structure.position).toBe('static')
    expect(structure.transform).toBe('none')
    expect(structure.shadow).toBe('none')
    expect(structure.panelOverflowY).toBe('auto')

    const measure = () =>
      page.evaluate(() => {
        const panel = document.querySelector('.lb-panel')
        const dockBox = document
          .querySelector('.lb-dock')
          .getBoundingClientRect()
        const panelBox = panel.getBoundingClientRect()
        // A row's VISIBLE box is clipped by the scroller, so only the part
        // inside the panel can ever be seen; it must end above the dock.
        const overlapping = [...panel.querySelectorAll('.lb-row')].filter(
          (r) => {
            const b = r.getBoundingClientRect()
            const visTop = Math.max(b.top, panelBox.top)
            const visBottom = Math.min(b.bottom, panelBox.bottom)
            return (
              visBottom > visTop &&
              visBottom > dockBox.top &&
              visTop < dockBox.bottom
            )
          }
        ).length
        return {
          scrollTop: Math.round(panel.scrollTop),
          max: panel.scrollHeight - panel.clientHeight,
          dockBottom: Math.round(dockBox.bottom),
          dockTop: Math.round(dockBox.top),
          panelBottom: Math.round(panelBox.bottom),
          overlapping,
          vh: innerHeight,
        }
      })

    const top = await measure()
    expect(top.max).toBeGreaterThan(200) // content really overflows
    expect(top.dockBottom).toBe(top.vh) // flush at the bottom
    expect(top.panelBottom).toBeLessThanOrEqual(top.dockTop)
    expect(top.overlapping).toBe(0)
    await page.screenshot({ path: `${SHOT_DIR}/${board}-top-390x844.png` })

    // Wheel scroll changes scrollTop; the dock does not move.
    await panel.hover()
    await page.mouse.wheel(0, 500)
    await expect
      .poll(async () => (await measure()).scrollTop)
      .toBeGreaterThan(0)
    const mid = await measure()
    expect(mid.dockBottom).toBe(top.dockBottom)
    expect(mid.overlapping).toBe(0)
    await page.screenshot({ path: `${SHOT_DIR}/${board}-middle-390x844.png` })

    // Touch-style scroll (programmatic drag is not available on desktop
    // engines, so also scroll to the very end through the scroller itself).
    await panel.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
    await expect
      .poll(async () => {
        const m = await measure()
        return m.scrollTop >= m.max - 1
      })
      .toBe(true)
    const bottom = await measure()
    expect(bottom.dockBottom).toBe(top.dockBottom)
    expect(bottom.overlapping).toBe(0)
    await expect(dock).toBeVisible()
    await page.screenshot({ path: `${SHOT_DIR}/${board}-bottom-390x844.png` })
  })
}
