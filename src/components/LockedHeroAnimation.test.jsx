// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'

// A locked hero must still play its idle + emotes: the locked look is CSS only
// (heroLocked.css), never a frozen sprite. These tests drive the REAL
// AnimatedSprite with a fake rAF clock and count which frames get drawn.
const manifest = {
  frameCount: 24,
  frameWidth: 10,
  frameHeight: 10,
  sheets: [
    { cols: 6, rows: 4, frames: 24, loadUrl: () => Promise.resolve('u') },
  ],
}
vi.mock('../utils/heroSprites', () => ({
  getHeroSprite: () => ({ poses: { idle: manifest } }),
}))
vi.mock('../utils/emotes', () => ({
  resolveEmoteAsset: () => manifest,
}))
vi.mock('../utils/spriteSheetCache', () => ({
  acquireSheet: () => ({
    ready: Promise.resolve({}),
    release: vi.fn(),
  }),
}))
import HeroFigure from './HeroFigure'
import EmoteGlyph from './EmoteGlyph'

let rafCb
let drawn
beforeEach(() => {
  drawn = []
  rafCb = null
  vi.stubGlobal('requestAnimationFrame', (cb) => {
    rafCb = cb
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  window.matchMedia = () => ({ matches: false })
  HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {},
    drawImage(_b, sx, sy) {
      drawn.push(`${sx},${sy}`)
    },
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function play(ui) {
  render(ui)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
  // advance the clock ~5 frames
  for (let t = 0; t <= 5; t += 1) {
    await act(async () => {
      rafCb?.(1000 + t * 42)
    })
  }
  return new Set(drawn).size
}

describe('locked hero animation', () => {
  it('idle: HeroFigure advances frames even when marked locked', async () => {
    expect(
      await play(<HeroFigure hero={{ name: 'Blaze' }} locked />)
    ).toBeGreaterThan(1)
  })
  it('emote: an emote on a locked hero advances frames', async () => {
    expect(
      await play(
        <EmoteGlyph heroName="Blaze" emoteName="Hip Hop" size={96} active />
      )
    ).toBeGreaterThan(1)
  })
})
