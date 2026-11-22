import { describe, expect, it } from 'vitest'
import { resolveMapConfig, withApiKey } from './mapProvider'

describe('map provider config', () => {
  it('defaults are exactly today: OpenFreeMap styles + OSRM demo + OSM credits', () => {
    const c = resolveMapConfig({})
    expect(c.styles.map((s) => [s.id, s.styleUrl])).toEqual([
      ['positron', 'https://tiles.openfreemap.org/styles/positron'],
      ['liberty', 'https://tiles.openfreemap.org/styles/liberty'],
      ['bright', 'https://tiles.openfreemap.org/styles/bright'],
    ])
    expect(c.defaultStyleUrl).toBe(
      'https://tiles.openfreemap.org/styles/positron'
    )
    expect(c.transformRequest).toBeUndefined()
    expect(c.routing).toMatchObject({
      provider: 'osrm',
      enabled: true,
      baseUrl: 'https://router.project-osrm.org/route/v1',
      apiKey: '',
    })
    expect(c.rasterTiles.url).toBe(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
    )
    // Same wording the app showed before it was config-driven.
    expect(c.creditLine).toBe(
      '© OpenStreetMap contributors · OpenMapTiles · OpenFreeMap'
    )
    expect(c.creditText).toBe(
      'Map data © OpenStreetMap contributors, OpenMapTiles, OpenFreeMap'
    )
    expect(c.attribution.links.map((l) => l.prefix + l.label)).toEqual([
      'OpenFreeMap',
      '© OpenMapTiles',
      'Data from OpenStreetMap',
    ])
    // Blank env values behave like unset ones.
    expect(
      resolveMapConfig({ VITE_MAP_STYLE_URL: '  ', VITE_ROUTING_URL: '' })
        .styles
    ).toEqual(c.styles)
  })

  it('a custom provider: style template, API key (style URL + same-host requests) and its own credits', () => {
    const c = resolveMapConfig({
      VITE_MAP_PROVIDER: 'custom',
      VITE_MAP_STYLE_URL: 'https://api.example.com/maps/{style}/style.json',
      VITE_MAP_API_KEY: 'k 1',
      VITE_MAP_ATTRIBUTION: '© ExampleMaps|https://example.com/credits',
    })
    expect(c.styles[0].styleUrl).toBe(
      'https://api.example.com/maps/positron/style.json?key=k%201'
    )
    expect(
      c.transformRequest('https://api.example.com/tiles/1/2/3.pbf').url
    ).toBe('https://api.example.com/tiles/1/2/3.pbf?key=k%201')
    // Other hosts are left alone; a URL that already has the key too.
    expect(c.transformRequest('https://cdn.other.com/x.png').url).toBe(
      'https://cdn.other.com/x.png'
    )
    expect(c.transformRequest('https://api.example.com/a?key=abc').url).toBe(
      'https://api.example.com/a?key=abc'
    )
    // Credits come from the provider, and OSM is always credited.
    expect(c.creditLine).toBe('© OpenStreetMap contributors · ExampleMaps')
    expect(c.attribution.links.map((l) => l.label)).toEqual([
      '© ExampleMaps',
      'OpenStreetMap',
    ])
    // No {style} in the URL = a single fixed style for the picker.
    const fixed = resolveMapConfig({
      VITE_MAP_PROVIDER: 'custom',
      VITE_MAP_STYLE_URL: 'https://x.test/style.json',
      VITE_MAP_API_KEY_PARAM: 'apikey',
      VITE_MAP_API_KEY: 'z',
    })
    expect(fixed.styles).toEqual([
      {
        id: 'default',
        name: 'Standard',
        styleUrl: 'https://x.test/style.json?apikey=z',
      },
    ])
  })

  it('routing: custom URL + key, and "none" turns snapping off', () => {
    const c = resolveMapConfig({
      VITE_ROUTING_URL: 'https://osrm.mine.test/route/v1/',
      VITE_ROUTING_API_KEY: 'r',
    })
    expect(c.routing.baseUrl).toBe('https://osrm.mine.test/route/v1')
    expect(c.routing.apiKey).toBe('r')
    expect(
      resolveMapConfig({ VITE_ROUTING_PROVIDER: 'none' }).routing
    ).toMatchObject({ provider: 'none', enabled: false })
  })

  it('withApiKey keeps URL templates intact and is a no-op without a key', () => {
    expect(withApiKey('https://a.test/{z}/{x}/{y}.png', 'K')).toBe(
      'https://a.test/{z}/{x}/{y}.png?key=K'
    )
    expect(withApiKey('https://a.test/r?x=1', 'K', 'token')).toBe(
      'https://a.test/r?x=1&token=K'
    )
    expect(withApiKey('https://a.test/r', '')).toBe('https://a.test/r')
  })
})
