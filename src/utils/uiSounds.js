// The ONE global handler behind every UI click/pop-up sound in the game - no
// per-component sound code. Installed once while the game screen is up
// (GamePage.jsx); the sign-in/auth screens before it stay silent.
//
// - Click: a single capture-phase `click` listener on the document. `click`
//   (not pointerdown) so a scroll/drag that starts on a button never makes a
//   sound, and so keyboard activation (Enter/Space) is covered by the same
//   path - one sound per tap, never pointerdown + click both firing.
// - What counts as tappable: button, [role=button|tab|switch|menuitem|option|
//   checkbox|radio], a[href], summary, [data-tap], and "custom tap targets" -
//   any element whose own computed cursor is pointer (the way this game's
//   div/span cards, tiles and map markers announce they're tappable).
// - Opt out with data-no-sound on the element or any ancestor (for controls
//   that already play their own sound, e.g. Equip / Buy / reward buttons).
// - Pop-ups: a MutationObserver plays the short "pop" when a dialog / popup
//   layer appears.
// - One shared gate: at most one sound per MIN_GAP_MS across clicks and pops.
//   A pop that lands inside that window (a tap that opens a modal) is deferred
//   to the end of the window instead of dropped or layered on the click.
// The Sound setting is checked inside playSfx (gameSound.js), so toggling it
// takes effect live with nothing to re-install.
import { playSfx, preloadSfx } from './gameSound'

export const MIN_GAP_MS = 60
const POPUP_SELECTOR = '[role="dialog"], [aria-modal="true"], .game-popup-layer'
const TAP_SELECTOR = [
  'button',
  '[role="button"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="checkbox"]',
  '[role="radio"]',
  'a[href]',
  'summary',
  '[data-tap]',
].join(',')
// Mounting the game renders its first popups/layers; don't pop for those.
const SETTLE_MS = 1500

let lastAt = -Infinity
let pendingPop = null

// True (and claims the slot) if a sound may play now.
function claim(now) {
  if (now - lastAt < MIN_GAP_MS) return false
  lastAt = now
  return true
}

function isDisabled(el) {
  return el.disabled === true || el.getAttribute('aria-disabled') === 'true'
}

// The element a click should count as a "tap" on, or null.
export function findTapTarget(start) {
  if (!(start instanceof Element)) return null
  if (start.closest('[data-no-sound]')) return null
  const known = start.closest(TAP_SELECTOR)
  if (known) return isDisabled(known) ? null : known
  // Custom tap target: the element that SETS cursor:pointer (cursor is
  // inherited, so climb while the parent has it too and take the topmost).
  let el = start
  if (getComputedStyle(el).cursor !== 'pointer') return null
  while (
    el.parentElement &&
    el.parentElement !== document.body &&
    getComputedStyle(el.parentElement).cursor === 'pointer'
  ) {
    el = el.parentElement
  }
  if (el.closest('[data-no-sound]') || isDisabled(el)) return null
  return el
}

function onClick(e) {
  if (!e.isTrusted) return // a script's .click() is not a player's tap
  const target = findTapTarget(e.target)
  if (!target) return
  if (!claim(performance.now())) return
  playSfx(target.closest('.game-menu-btn') ? 'menu' : 'tap')
}

function schedulePop() {
  const now = performance.now()
  if (claim(now)) {
    playSfx('pop')
    return
  }
  if (pendingPop != null) return // one deferred pop is enough
  pendingPop = setTimeout(
    () => {
      pendingPop = null
      if (claim(performance.now())) playSfx('pop')
    },
    Math.max(0, lastAt + MIN_GAP_MS - now) + 1
  )
}

function isPopup(node) {
  if (node.nodeType !== 1 || node.closest('[data-no-sound]')) return false
  return node.matches(POPUP_SELECTOR) || node.querySelector(POPUP_SELECTOR)
}

export function installUiSounds() {
  if (typeof document === 'undefined') return () => {}
  preloadSfx()
  const installedAt = performance.now()
  document.addEventListener('click', onClick, true)
  const observer = new MutationObserver((mutations) => {
    if (performance.now() - installedAt < SETTLE_MS) return
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (isPopup(node)) {
          schedulePop()
          return // one pop per batch
        }
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
  return () => {
    document.removeEventListener('click', onClick, true)
    observer.disconnect()
    clearTimeout(pendingPop)
    pendingPop = null
  }
}
