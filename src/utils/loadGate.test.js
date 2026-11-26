import { describe, expect, it } from 'vitest'
import { GATE, meGate, shopGate } from './loadGate'

describe('Me gate', () => {
  const base = {
    isAuthed: true,
    profile: null,
    profileError: false,
    timedOut: false,
  }
  it('first paint with nothing yet: skeleton, not blank', () => {
    expect(meGate(base)).toBe(GATE.LOADING)
  })
  it('data (or a cached copy) present: content, never a skeleton', () => {
    expect(meGate({ ...base, profile: { level: 3 } })).toBe(GATE.CONTENT)
    expect(meGate({ ...base, profile: { level: 3 }, timedOut: true })).toBe(
      GATE.CONTENT
    )
  })
  it('failure with nothing cached: error; a skeleton past the timeout: timeout error', () => {
    expect(meGate({ ...base, profileError: true })).toBe(GATE.FAILED)
    expect(meGate({ ...base, timedOut: true })).toBe(GATE.TIMEOUT)
  })
  it('signed out: nothing to wait for', () => {
    expect(meGate({ ...base, isAuthed: false })).toBe(GATE.CONTENT)
  })
})

describe('Shop gate', () => {
  const base = {
    section: 'heroes',
    heroCount: 0,
    heroesSettled: false,
    heroesLoading: false,
    heroesError: false,
    catalogLoaded: false,
    storeError: null,
    timedOut: false,
  }
  it('heroes: skeleton before and during the fetch (no "no heroes" flash)', () => {
    expect(shopGate(base)).toBe(GATE.LOADING)
    expect(shopGate({ ...base, heroesLoading: true })).toBe(GATE.LOADING)
  })
  it('heroes: a cached roster shows content immediately', () => {
    expect(shopGate({ ...base, heroCount: 5, heroesLoading: true })).toBe(
      GATE.CONTENT
    )
  })
  it('heroes: loaded but truly empty is content (the empty note), not a skeleton', () => {
    expect(shopGate({ ...base, heroesSettled: true })).toBe(GATE.CONTENT)
  })
  it('heroes: failed with nothing cached -> error; timeout -> timeout', () => {
    expect(shopGate({ ...base, heroesSettled: true, heroesError: true })).toBe(
      GATE.FAILED
    )
    expect(shopGate({ ...base, timedOut: true })).toBe(GATE.TIMEOUT)
  })
  it('territory / trail: skeleton until the catalog request succeeds', () => {
    for (const section of ['territory', 'trail']) {
      expect(shopGate({ ...base, section })).toBe(GATE.LOADING)
      expect(shopGate({ ...base, section, catalogLoaded: true })).toBe(
        GATE.CONTENT
      )
      expect(shopGate({ ...base, section, storeError: 'x' })).toBe(GATE.FAILED)
      expect(shopGate({ ...base, section, timedOut: true })).toBe(GATE.TIMEOUT)
    }
  })
})
