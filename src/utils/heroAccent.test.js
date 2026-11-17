import { describe, expect, it } from 'vitest'
import {
  ACCENT_MIN_CONTRAST,
  contrastWithWhite,
  getHeroAccent,
} from './heroAccent'

const HEROES = ['Blaze', 'Bolt', 'Comet', 'Cyclone', 'Nova', 'Phantom', 'Pulse']

describe('getHeroAccent', () => {
  it.each(HEROES)('%s: white text on the accent is readable (AA)', (name) => {
    const { accent, soft, rgb } = getHeroAccent(name)
    expect(accent).toMatch(/^#[0-9a-f]{6}$/)
    expect(soft).toMatch(/^#[0-9a-f]{6}$/)
    expect(contrastWithWhite(rgb)).toBeGreaterThanOrEqual(ACCENT_MIN_CONTRAST)
  })

  it('every hero gets its own accent', () => {
    const accents = HEROES.map((n) => getHeroAccent(n).accent)
    expect(new Set(accents).size).toBe(HEROES.length)
  })

  it('an unknown hero falls back to the default stage hero accent', () => {
    expect(getHeroAccent('Nobody').accent).toBe(getHeroAccent('Blaze').accent)
  })
})
