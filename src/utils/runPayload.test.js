import { describe, expect, it } from 'vitest'
import { backendRunModeOf, buildRunPayload } from './runPayload'

const base = {
  points: [{ lat: 1, lng: 2, timestamp: 1 }],
  distance: 1200,
  duration: 400,
  startedAt: new Date('2025-01-01T10:00:00Z'),
  endedAt: new Date('2025-01-01T10:07:00Z'),
  clientRunId: 'run-1',
}

describe('buildRunPayload mode', () => {
  it('Training sends mode TRAINING', () => {
    expect(buildRunPayload({ ...base, isTraining: true }).mode).toBe('TRAINING')
  })
  it('Conquer sends NO mode (unchanged body; the server derives it)', () => {
    const body = buildRunPayload(base)
    expect(body.mode).toBeUndefined()
    expect(JSON.parse(JSON.stringify(body))).not.toHaveProperty('mode')
  })
  it('PvP / Club War never send TRAINING, even with a stale training flag', () => {
    expect(
      backendRunModeOf({ isTraining: true, challengeId: 'c' })
    ).toBeUndefined()
    expect(
      backendRunModeOf({ isTraining: true, clubWarId: 'w' })
    ).toBeUndefined()
    expect(buildRunPayload({ ...base, challengeId: 'c' }).mode).toBeUndefined()
  })
  it('keeps the rest of the body (ids, points, idempotency key)', () => {
    const body = buildRunPayload({ ...base, isTraining: true })
    expect(body).toMatchObject({
      eventId: null,
      distance: 1200,
      duration: 400,
      clientRunId: 'run-1',
    })
    expect(body.points).toHaveLength(1)
  })
})

describe('buildRunPayload backend fields (offline / steps / elevation)', () => {
  const outdoorPoints = [
    { lat: 27.7, lng: 85.3, timestamp: 1000, accuracy: 6, elevation: 1300.5 },
    {
      lat: 27.7001,
      lng: 85.3001,
      timestamp: 2000,
      accuracy: 7,
      elevation: null,
    },
  ]
  it('outdoor Training: mode TRAINING, points keep per-point elevation (null when unknown)', () => {
    const body = buildRunPayload({
      ...base,
      isTraining: true,
      points: outdoorPoints,
      stepCount: 900,
    })
    expect(body.mode).toBe('TRAINING')
    expect(body.points.map((p) => p.elevation)).toEqual([1300.5, null])
    expect(body.steps).toBe(900)
    // Never linked to a PvP / territory id.
    expect(body.challengeId).toBeUndefined()
    expect(body.clubWarId).toBeUndefined()
    expect(body.eventId).toBeNull()
  })
  it('indoor Training with no GPS: empty points are sent as [] (the server allows it for TRAINING)', () => {
    const body = buildRunPayload({
      ...base,
      isTraining: true,
      points: undefined,
      distance: 0,
    })
    expect(body.points).toEqual([])
    expect(body.mode).toBe('TRAINING')
  })
  it.each([[null], [undefined], [0], [NaN], ['x']])(
    'steps %s is left out - never a fake 0',
    (steps) => {
      const body = buildRunPayload({ ...base, stepCount: steps })
      expect(body.steps).toBeUndefined()
      expect(JSON.parse(JSON.stringify(body))).not.toHaveProperty('steps')
    }
  )
  it('sends time-zone-safe epoch times next to the local strings', () => {
    const body = buildRunPayload(base)
    expect(body.startedAtEpochMs).toBe(Date.parse('2025-01-01T10:00:00Z'))
    expect(body.endedAtEpochMs).toBe(Date.parse('2025-01-01T10:07:00Z'))
    expect(typeof body.startedAt).toBe('string')
  })
  it('works from the ISO strings a saved run stores', () => {
    const body = buildRunPayload({
      ...base,
      startedAt: '2025-01-01T10:00:00.000Z',
      endedAt: '2025-01-01T10:07:00.000Z',
    })
    expect(body.endedAtEpochMs).toBe(Date.parse('2025-01-01T10:07:00Z'))
  })
  it('offline marker only when queued; platform is one the server accepts', () => {
    expect(buildRunPayload(base).offline).toBeUndefined()
    expect(buildRunPayload(base, { offline: true }).offline).toBe(true)
    expect(['ios', 'android', 'web']).toContain(buildRunPayload(base).platform)
  })
  it('the idempotency key is the same on every rebuild (retries never create a second run)', () => {
    const a = buildRunPayload(base, { offline: true })
    const b = buildRunPayload(base)
    expect(a.clientRunId).toBe('run-1')
    expect(b.clientRunId).toBe(a.clientRunId)
  })
})

describe('buildRunPayload - indoor (treadmill) Training', () => {
  const indoor = {
    ...base,
    points: [],
    isTraining: true,
    isIndoor: true,
    distance: 5000,
    duration: 1800,
    stepCount: 4500,
    stepsSource: 'pedometer',
    distanceSource: 'manual',
  }
  it('is a TRAINING run with NO points (the one case the server allows)', () => {
    const body = buildRunPayload(indoor)
    expect(body.mode).toBe('TRAINING')
    expect(body.points).toEqual([])
    expect(body).toMatchObject({
      distance: 5000,
      duration: 1800,
      clientRunId: 'run-1',
      eventId: null,
      steps: 4500,
      stepsSource: 'pedometer',
      indoor: true,
      distanceSource: 'manual',
    })
    expect(body.challengeId).toBeUndefined()
    expect(body.clubWarId).toBeUndefined()
  })
  it('steps are left out (not 0) when there is no reliable source', () => {
    const body = JSON.parse(
      JSON.stringify(
        buildRunPayload({ ...indoor, stepCount: null, stepsSource: null })
      )
    )
    expect(body).not.toHaveProperty('steps')
    expect(body).not.toHaveProperty('stepsSource')
  })
  it('an outdoor run carries no indoor fields', () => {
    const body = JSON.parse(JSON.stringify(buildRunPayload(base)))
    expect(body).not.toHaveProperty('indoor')
    expect(body).not.toHaveProperty('distanceSource')
  })
})
