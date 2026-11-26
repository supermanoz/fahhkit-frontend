import { describe, expect, it } from 'vitest'
import { buildGpx, gpxFilename, gpxForRecord } from './gpx'

const pts = [
  {
    lat: 27.7,
    lng: 85.3,
    timestamp: Date.parse('2026-03-10T06:00:00Z'),
    elevation: 1300.5,
  },
  {
    lat: 27.7001,
    lng: 85.3002,
    timestamp: Date.parse('2026-03-10T06:00:05Z'),
    elevation: null,
  },
  { lat: 'bad', lng: 1 },
]

describe('GPX export', () => {
  it('is valid GPX 1.1 with one track point per good fix, in order', () => {
    const xml = buildGpx({ points: pts, name: 'Run' })
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<gpx version="1.1" creator="Run Conquest"')
    expect(xml.match(/<trkpt /g)).toHaveLength(2)
    expect(xml).toContain(
      '<trkpt lat="27.7" lon="85.3"><ele>1300.5</ele><time>2026-03-10T06:00:00.000Z</time></trkpt>'
    )
    // unknown elevation is left out, never written as 0
    expect(xml).toContain(
      '<trkpt lat="27.7001" lon="85.3002"><time>2026-03-10T06:00:05.000Z</time></trkpt>'
    )
    expect(xml.indexOf('06:00:00')).toBeLessThan(xml.indexOf('06:00:05'))
  })
  it('escapes the track name', () => {
    expect(buildGpx({ points: [], name: 'A & <B>' })).toContain(
      'A &amp; &lt;B&gt;'
    )
  })
  it('an empty run still produces a well-formed file', () => {
    const xml = buildGpx({})
    expect(xml).toContain('<trkseg>')
    expect(xml).toContain('</gpx>')
  })
  it('builds from an outbox record with a dated filename', () => {
    const record = {
      summary: { startedAt: '2026-03-10T06:00:00.000Z' },
      payload: { points: pts },
    }
    const { xml, filename } = gpxForRecord(record)
    expect(filename).toBe('run-conquest-20260310-0600.gpx')
    expect(xml.match(/<trkpt /g)).toHaveLength(2)
    expect(gpxFilename({})).toMatch(/^run-conquest-.*\.gpx$/)
  })
})
