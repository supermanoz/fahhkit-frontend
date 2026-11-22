import { afterEach, describe, expect, it, vi } from 'vitest'
import { snapSegment } from './routeSnapping'

const A = { lat: 27.7, lng: 85.3 }
const B = { lat: 27.71, lng: 85.31 }
const ON = {
  enabled: true,
  baseUrl: 'https://osrm.test/route/v1',
  apiKey: 'K',
  apiKeyParam: 'key',
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('snapSegment fallback', () => {
  it('provider "none": raw segment, no network, flagged disabled (not an error)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const r = await snapSegment(A, B, { ...ON, enabled: false })
    expect(r).toEqual({ points: [A, B], snapped: false, disabled: true })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('routing down: draws the raw segment instead of throwing', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    const p = snapSegment(A, B, ON)
    await vi.runAllTimersAsync()
    expect(await p).toEqual({ points: [A, B], snapped: false })
  })

  it('routing works: snapped geometry, key sent on the request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [
          {
            geometry: {
              coordinates: [
                [85.3, 27.7],
                [85.305, 27.705],
                [85.31, 27.71],
              ],
            },
          },
        ],
      }),
    })
    const r = await snapSegment(A, B, ON)
    expect(r.snapped).toBe(true)
    expect(r.points).toHaveLength(3)
    expect(fetchSpy.mock.calls[0][0]).toBe(
      'https://osrm.test/route/v1/foot/85.3,27.7;85.31,27.71?overview=full&geometries=geojson&key=K'
    )
  })
})
