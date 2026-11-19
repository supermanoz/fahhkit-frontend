import { describe, expect, it } from 'vitest'
import { SCORE_COMPONENT_TYPES } from './hero'
import { PERK_INFO, PERK_MODES, describePerk } from './heroPerks'

// The perks the backend seeds today (V1_1__seed_data.sql).
const SEEDED = [
  { hero: 'Blaze', componentType: 'PACE', multiplier: 1.05 },
  { hero: 'Phantom', componentType: 'AREA', multiplier: 1.05 },
  { hero: 'Bolt', componentType: 'BASE_EFFORT', multiplier: 1.05 },
  { hero: 'Cyclone', componentType: 'RACE_TIME', multiplier: 0.95 },
  { hero: 'Pulse', componentType: 'PERIMETER_EFFICIENCY', multiplier: 1.05 },
]

describe('every perk has a description', () => {
  it('covers every perk type the game knows (so a new one cannot ship undescribed)', () => {
    for (const id of SCORE_COMPONENT_TYPES) {
      expect(PERK_INFO[id], `missing description for ${id}`).toBeTruthy()
    }
  })
  it('covers every seeded hero perk, with all the pieces filled in', () => {
    for (const a of SEEDED) {
      const d = describePerk(a)
      expect(d, a.hero).toBeTruthy()
      expect(d.name.length).toBeGreaterThan(2)
      expect(d.valueText).toMatch(/^[+−]\d+%$/)
      expect(d.summary.length).toBeGreaterThan(10)
      expect(d.sentence.length).toBeGreaterThan(20)
      expect(d.example.length).toBeGreaterThan(8)
      expect(d.where.length).toBeGreaterThan(0)
    }
  })
  it('an unknown perk or an empty ability gets no popup', () => {
    expect(describePerk({ componentType: 'NOPE', multiplier: 1.05 })).toBeNull()
    expect(describePerk({ componentType: 'PACE' })).toBeNull()
    expect(describePerk(null)).toBeNull()
  })
})

describe('copy is true to the code', () => {
  it('Race Time: counts shorter, with the real example (10:00 -> 9:30)', () => {
    const d = describePerk({ componentType: 'RACE_TIME', multiplier: 0.95 })
    expect(d.valueText).toBe('−5%')
    expect(d.sentence).toBe(
      'Your time in PvP races counts 5% shorter, so you win more close races.'
    )
    expect(d.example).toBe('A 10:00 race counts as 9:30.')
    expect(d.where).toEqual(['PvP'])
  })
  it('score perks add to ONE part of the score; examples use the real multiplier', () => {
    expect(
      describePerk({ componentType: 'PACE', multiplier: 1.05 }).example
    ).toBe('If your pace earns 20 points, you get 21.')
    expect(
      describePerk({ componentType: 'BASE_EFFORT', multiplier: 1.05 }).example
    ).toBe('A 5 km run earns 10 points, so you get 10.5.')
    expect(
      describePerk({ componentType: 'AREA', multiplier: 1.05 }).example
    ).toBe('A loop worth 12 points counts as 12.6.')
    expect(
      describePerk({ componentType: 'PERIMETER_EFFICIENCY', multiplier: 1.05 })
        .example
    ).toBe('A loop worth 30 shape points counts as 31.5.')
    expect(
      describePerk({ componentType: 'CLOSURE_PRECISION', multiplier: 1.05 })
        .example
    ).toBe('8 closing points count as 8.4.')
  })
  it('numbers follow the hero, not a hardcoded 5%', () => {
    const d = describePerk({ componentType: 'PACE', multiplier: 1.1 })
    expect(d.valueText).toBe('+10%')
    expect(d.sentence).toContain('10% bigger')
    expect(d.example).toBe('If your pace earns 20 points, you get 22.')
    expect(
      describePerk({ componentType: 'RACE_TIME', multiplier: 0.9 }).example
    ).toBe('A 10:00 race counts as 9:00.')
  })
  it('modes are only the ones the backend really applies the perk in', () => {
    const modes = (id) =>
      describePerk({ componentType: id, multiplier: 1.05 }).where
    // Loop-based parts: only when a loop closes (Conquer / Training).
    for (const id of ['AREA', 'PERIMETER_EFFICIENCY', 'CLOSURE_PRECISION'])
      expect(modes(id)).toEqual([PERK_MODES.CONQUER, PERK_MODES.TRAINING])
    // Pace + distance also count in Club War, never in PvP.
    for (const id of ['PACE', 'BASE_EFFORT']) {
      expect(modes(id)).toEqual([
        PERK_MODES.CONQUER,
        PERK_MODES.TRAINING,
        PERK_MODES.CLUB_WAR,
      ])
      expect(modes(id)).not.toContain(PERK_MODES.PVP)
    }
    // No perk claims "all runs" - none of them is.
    for (const id of Object.keys(PERK_INFO))
      expect(modes(id).join()).not.toMatch(/all/i)
  })
  it('never promises XP or coins', () => {
    for (const id of Object.keys(PERK_INFO)) {
      const d = describePerk({
        componentType: id,
        multiplier: id === 'RACE_TIME' ? 0.95 : 1.05,
      })
      expect(`${d.summary} ${d.sentence} ${d.example}`).not.toMatch(
        /\b(xp|coin|fahhcoin|gold)\b/i
      )
    }
  })
})

describe('reading level', () => {
  const sentences = (t) => t.split(/(?<=[.!?])\s+/).filter(Boolean)
  it('at most 2 short sentences, plain words, no formulas', () => {
    for (const id of Object.keys(PERK_INFO)) {
      const d = describePerk({
        componentType: id,
        multiplier: id === 'RACE_TIME' ? 0.95 : 1.05,
      })
      expect(sentences(d.sentence).length).toBeLessThanOrEqual(2)
      expect(sentences(d.example).length).toBe(1)
      for (const s of sentences(d.sentence))
        expect(s.split(/\s+/).length).toBeLessThanOrEqual(22)
      const all = `${d.summary} ${d.sentence} ${d.example}`
      expect(all).not.toMatch(
        /multipl|component|coefficient|formula|logarithm|algorithm|\*|×|=/i
      )
    }
  })
})

describe('a second perk', () => {
  const strong = { componentType: 'PACE', multiplier: 1.08 }
  const weak = { componentType: 'AREA', multiplier: 1.04 }
  it('is flagged as half strength next to a stronger one; the main one is not', () => {
    const all = [strong, weak]
    expect(describePerk(strong, all).note).toBeNull()
    expect(describePerk(weak, all).note).toMatch(/half strength/)
  })
  it('equal perks are not called secondary; a single perk never is', () => {
    const a = { componentType: 'PACE', multiplier: 1.05 }
    const b = { componentType: 'AREA', multiplier: 1.05 }
    expect(describePerk(a, [a, b]).note).toBeNull()
    expect(describePerk(a, [a]).note).toBeNull()
  })
})
