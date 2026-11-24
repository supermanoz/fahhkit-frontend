// @vitest-environment jsdom
/* global process */
import { describe, expect, it, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { installPageZoomGuard, isInsideMap } from './pageZoomGuard'

let remove
afterEach(() => {
  remove?.()
  document.body.innerHTML = ''
})

function setup() {
  document.body.innerHTML = `
    <div id="ui"><button id="btn">x</button><input id="field" /></div>
    <div class="leaflet-container"><div id="tile"></div></div>`
  remove = installPageZoomGuard(document)
}
function fire(el, type, touches) {
  const e = new Event(type, { bubbles: true, cancelable: true })
  if (touches) e.touches = touches
  el.dispatchEvent(e)
  return e.defaultPrevented
}

describe('pageZoomGuard', () => {
  it('cancels Safari pinch gestures outside the map', () => {
    setup()
    for (const t of ['gesturestart', 'gesturechange', 'gestureend']) {
      expect(fire(document.getElementById('btn'), t)).toBe(true)
      expect(fire(document.body, t)).toBe(true)
    }
  })
  it('lets the map keep its own pinch/zoom', () => {
    setup()
    const tile = document.getElementById('tile')
    for (const t of ['gesturestart', 'gesturechange', 'gestureend']) {
      expect(fire(tile, t)).toBe(false)
    }
    expect(fire(tile, 'touchmove', [{}, {}])).toBe(false)
    expect(isInsideMap(tile)).toBe(true)
  })
  it('cancels a two-finger touchmove outside the map only', () => {
    setup()
    expect(fire(document.getElementById('btn'), 'touchmove', [{}, {}])).toBe(
      true
    )
    expect(fire(document.getElementById('field'), 'touchmove', [{}, {}])).toBe(
      true
    )
  })
  it('never touches single-finger scrolling', () => {
    setup()
    expect(fire(document.getElementById('btn'), 'touchmove', [{}])).toBe(false)
    expect(fire(document.body, 'touchmove', [])).toBe(false)
  })
  it('can be removed', () => {
    setup()
    remove()
    remove = undefined
    expect(fire(document.getElementById('btn'), 'gesturestart')).toBe(false)
  })
})

describe('no-zoom configuration', () => {
  const read = (p) => readFileSync(join(process.cwd(), p), 'utf8')
  it('viewport meta disables user scaling', () => {
    const html = read('index.html')
    expect(html).toMatch(
      /width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover/
    )
  })
  it('global CSS: manipulation, no overscroll, no text autosize, 16px inputs', () => {
    const css = read('src/index.css')
    expect(css).toMatch(
      /html,\s*body,\s*#root\s*{\s*touch-action: manipulation/
    )
    expect(css).toMatch(/overscroll-behavior: none/)
    expect(css).toMatch(/-webkit-text-size-adjust: 100%/)
    expect(css).toMatch(/-webkit-touch-callout: none/)
    expect(css).toMatch(
      /@media \(pointer: coarse\)[\s\S]*font-size: 16px !important/
    )
    // typing fields stay selectable
    expect(css).toMatch(
      /:is\(input, textarea, select[^)]*\)[\s\S]*user-select: text/
    )
  })
  it('Android WebView page zoom is off', () => {
    const java = read(
      'android/app/src/main/java/com/runconquest/game/MainActivity.java'
    )
    expect(java).toContain('setSupportZoom(false)')
    expect(java).toContain('setBuiltInZoomControls(false)')
  })
})
