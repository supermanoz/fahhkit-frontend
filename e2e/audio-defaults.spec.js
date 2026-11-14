import { test, expect, seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'

// Music + Sound default ON for a first launch (nothing in storage), a saved
// "off" choice stays off, both toggles work live, and the single global
// handler (utils/uiSounds.js) plays exactly one click sound per tap.
//
// Sounds are observed by spying on the audio APIs before the app loads:
//  - a click "tap" = one noise-burst buffer source (gameSound.js 'tap')
//  - the music / menu / pop samples = HTMLMediaElement.play() calls
const MUSIC_KEY = 'fahhkit_territory_music_muted'
const SFX_KEY = 'fahhkit_territory_sfx_muted'

function spy() {
  const w = window
  w.__snd = { taps: 0, plays: [] }
  const proto = (w.BaseAudioContext || w.AudioContext).prototype
  const origBuf = proto.createBufferSource
  proto.createBufferSource = function (...a) {
    w.__snd.taps += 1
    return origBuf.apply(this, a)
  }
  const origPlay = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function (...a) {
    w.__snd.plays.push((this.currentSrc || this.src || '').split('/').pop())
    return origPlay.apply(this, a)
  }
}

const taps = (page) => page.evaluate(() => window.__snd.taps)
const plays = (page, name) =>
  page.evaluate((n) => window.__snd.plays.filter((p) => p === n).length, name)

async function openGame(page, { stored } = {}) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(spy)
  if (stored) {
    await page.addInitScript((kv) => {
      for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v)
    }, stored)
  }
  await seedSession(page, VETERAN)
  await page.goto('/game')
  // The loading overlay is absent before it first mounts - require it to
  // stay gone, then the HUD.
  let goneSince = null
  await expect
    .poll(
      async () => {
        if ((await page.locator('.game-loading-overlay').count()) > 0) {
          goneSince = null
          return false
        }
        goneSince ??= Date.now()
        return Date.now() - goneSince > 3000
      },
      { timeout: 90_000, intervals: [500] }
    )
    .toBe(true)
  await expect(page.locator('.game-hud-level')).toBeVisible({ timeout: 20_000 })
  await page
    .getByText('Not now')
    .click({ timeout: 2500 })
    .catch(() => {})
}

async function openSettings(page) {
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('switch', { name: /music/i })).toBeVisible()
}

test.describe('Audio defaults and the global click sound', () => {
  test('first launch (empty storage): music and sound are ON', async ({
    mockedPage: page,
  }) => {
    await openGame(page)
    expect(
      await page.evaluate((k) => localStorage.getItem(k), MUSIC_KEY)
    ).toBeNull()
    expect(
      await page.evaluate((k) => localStorage.getItem(k), SFX_KEY)
    ).toBeNull()
    // Music was attempted as soon as the game screen loaded...
    expect(await plays(page, 'territory-theme.mp3')).toBeGreaterThan(0)
    // ...and if the browser blocked it, the first tap starts it.
    await page.locator('.game-menu-btn').click()
    await expect
      .poll(() =>
        page.evaluate(
          () => !document.querySelector('audio[src*="territory-theme"]').paused
        )
      )
      .toBe(true)
    // A tap makes a click sound (Sound defaults on).
    const before = await taps(page)
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    expect(await taps(page)).toBe(before + 1)
    await expect(page.getByRole('switch', { name: /music/i })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await expect(page.getByRole('switch', { name: /sound/i })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })

  test('saved-off choices stay off; toggles work live', async ({
    mockedPage: page,
  }) => {
    await openGame(page, { stored: { [MUSIC_KEY]: 'true', [SFX_KEY]: 'true' } })
    // Music never starts, no click sounds.
    expect(await plays(page, 'territory-theme.mp3')).toBe(0)
    await openSettings(page) // two taps - must both be silent
    expect(await taps(page)).toBe(0)
    expect(
      await page.evaluate(
        () => document.querySelector('audio[src*="territory-theme"]').paused
      )
    ).toBe(true)
    await expect(page.getByRole('switch', { name: /music/i })).toHaveAttribute(
      'aria-checked',
      'false'
    )
    await expect(page.getByRole('switch', { name: /sound/i })).toHaveAttribute(
      'aria-checked',
      'false'
    )

    // Sound ON (live): the next tap is audible; music stays off.
    await page.getByRole('switch', { name: /sound/i }).click()
    const t0 = await taps(page)
    await page.getByRole('switch', { name: /music/i }).click() // a tap + music on
    expect(await taps(page)).toBe(t0 + 1)
    await expect
      .poll(() =>
        page.evaluate(
          () => !document.querySelector('audio[src*="territory-theme"]').paused
        )
      )
      .toBe(true)
    // Music OFF (live) pauses it but leaves Sound alone.
    await page.getByRole('switch', { name: /music/i }).click()
    await expect
      .poll(() =>
        page.evaluate(
          () => document.querySelector('audio[src*="territory-theme"]').paused
        )
      )
      .toBe(true)
    const t1 = await taps(page)
    await page
      .getByRole('button', { name: 'Shop', exact: true })
      .click({
        timeout: 5000,
      })
      .catch(() => page.locator('.game-menu-picker-current').click())
    expect(await taps(page)).toBeGreaterThan(t1)
  })

  test('one click sound per tap: roles, links, custom targets, opt-out, rate limit, pop-ups', async ({
    mockedPage: page,
  }) => {
    await openGame(page)
    await page.evaluate(() => {
      const root = document.querySelector('.game-root')
      root.insertAdjacentHTML(
        'beforeend',
        `<div style="position:fixed;left:8px;top:120px;z-index:99999;display:flex;flex-direction:column;gap:6px;background:#fff;padding:6px">
          <div role="button" id="t-role" tabindex="0">role=button</div>
          <a href="#t-link" id="t-link">link</a>
          <div id="t-custom" style="cursor:pointer">custom tap target</div>
          <div id="t-plain">plain text</div>
          <button id="t-optout" data-no-sound>opt out</button>
          <button id="t-disabled" disabled>disabled</button>
          <div data-no-sound><button id="t-optout-parent">opt out via parent</button></div>
        </div>`
      )
    })
    const delta = async (sel, opts = {}) => {
      await page.waitForTimeout(150) // clear the 60ms gate from the last tap
      const before = await taps(page)
      await page.locator(sel).click({ force: true, ...opts })
      return (await taps(page)) - before
    }
    expect(await delta('#t-role')).toBe(1)
    expect(await delta('#t-link')).toBe(1)
    expect(await delta('#t-custom')).toBe(1)
    expect(await delta('#t-plain')).toBe(0)
    expect(await delta('#t-optout')).toBe(0)
    expect(await delta('#t-optout-parent')).toBe(0)
    expect(await delta('#t-disabled')).toBe(0)
    // Two clicks inside the 60ms window = one sound.
    expect(await delta('#t-role', { clickCount: 2 })).toBe(1)

    // A pop-up appearing (dialog) plays the short pop once, even if two
    // arrive back to back.
    await page.waitForTimeout(200)
    const popsBefore = await plays(page, 'button-click.mp3')
    await page.evaluate(() => {
      for (let i = 0; i < 2; i++) {
        const d = document.createElement('div')
        d.setAttribute('role', 'dialog')
        d.textContent = 'popup ' + i
        document.body.appendChild(d)
      }
    })
    await page.waitForTimeout(400)
    expect((await plays(page, 'button-click.mp3')) - popsBefore).toBe(1)
  })
})
