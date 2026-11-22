// The ONE place the basemap provider (style/tile URL + its required credits)
// and the route-snapping provider are configured. Everything defaults to the
// current free setup (OpenFreeMap + the public OSRM demo), so with no env vars
// set nothing changes. To swap a provider set the VITE_* variables below (see
// .env.example); no other file hard-codes a map or routing URL.
//
//   VITE_MAP_PROVIDER         'openfreemap' (default) | 'custom'
//   VITE_MAP_STYLE_URL        style.json URL. May contain {style}, replaced by
//                             positron / liberty / bright (the 3 picker
//                             styles). Without {style} the picker has a
//                             single style. Default: OpenFreeMap's.
//   VITE_MAP_API_KEY          optional; appended to the style URL and to every
//                             request to the style's host (tiles, sprites,
//                             glyphs) that doesn't already carry it
//   VITE_MAP_API_KEY_PARAM    query param name for the key (default 'key')
//   VITE_MAP_ATTRIBUTION      credits for a custom provider:
//                             "Label|https://link, Label2|https://link2"
//   VITE_MAP_RASTER_URL       raster tile URL for the small Leaflet run map
//                             (default: OpenStreetMap's)
//   VITE_ROUTING_PROVIDER     'osrm' (default) | 'none' (no snapping, raw taps)
//   VITE_ROUTING_URL          OSRM-compatible base, ending in /route/v1
//   VITE_ROUTING_API_KEY      optional, appended to every routing request
//   VITE_ROUTING_API_KEY_PARAM  query param name for it (default 'key')
//
// Keys here ship inside the app bundle: use a key restricted to your domain /
// bundle id, never a secret one.

export const OPENFREEMAP_STYLE_TEMPLATE =
  'https://tiles.openfreemap.org/styles/{style}'
export const OSRM_DEMO_URL = 'https://router.project-osrm.org/route/v1'
export const OSM_RASTER_URL =
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

const STYLE_IDS = [
  { id: 'positron', name: 'Positron' },
  { id: 'liberty', name: 'Liberty' },
  { id: 'bright', name: 'Bright' },
]

// What each provider legally requires us to show. `prefix` is plain text
// before the link; entries render space-separated.
const OSM_LINK = {
  prefix: 'Data from ',
  label: 'OpenStreetMap',
  href: 'https://www.openstreetmap.org/copyright',
}
const PROVIDER_CREDITS = {
  openfreemap: {
    // Short form for the share image and Settings text.
    names: ['OpenStreetMap contributors', 'OpenMapTiles', 'OpenFreeMap'],
    links: [
      { prefix: '', label: 'OpenFreeMap', href: 'https://openfreemap.org' },
      {
        prefix: '',
        label: '© OpenMapTiles',
        href: 'https://www.openmaptiles.org/',
      },
      OSM_LINK,
    ],
  },
}

const clean = (v) => (typeof v === 'string' ? v.trim() : '')

// Appends `param=key` unless the URL already has that param. Plain string
// work (not URL()) so a template like https://x/{z}/{x}/{y}.png survives.
export function withApiKey(url, key, param = 'key') {
  if (!url || !key) return url
  const name = encodeURIComponent(param)
  if (new RegExp(`[?&]${name}=`).test(url)) return url
  return `${url}${url.includes('?') ? '&' : '?'}${name}=${encodeURIComponent(key)}`
}

// "Label|https://link, Label2|https://link2" -> credit entries.
export function parseAttribution(raw) {
  return clean(raw)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [label, href] = part.split('|').map((s) => s.trim())
      return { prefix: '', label, href: href || '' }
    })
    .filter((c) => c.label)
}

function hostOf(url) {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

export function resolveMapConfig(env = {}) {
  const requested = clean(env.VITE_MAP_PROVIDER).toLowerCase()
  const provider = requested === 'custom' ? 'custom' : 'openfreemap'

  const template =
    clean(env.VITE_MAP_STYLE_URL) ||
    (provider === 'openfreemap' ? OPENFREEMAP_STYLE_TEMPLATE : '')
  const apiKey = clean(env.VITE_MAP_API_KEY)
  const apiKeyParam = clean(env.VITE_MAP_API_KEY_PARAM) || 'key'

  // {style} -> the three picker styles; otherwise one fixed style.
  const styles = template.includes('{style}')
    ? STYLE_IDS.map(({ id, name }) => ({
        id,
        name,
        styleUrl: withApiKey(
          template.replace('{style}', id),
          apiKey,
          apiKeyParam
        ),
      }))
    : template
      ? [
          {
            id: 'default',
            name: 'Standard',
            styleUrl: withApiKey(template, apiKey, apiKeyParam),
          },
        ]
      : []

  // Credits follow the provider; a custom one declares its own, and falls back
  // to the OSM credit (nearly every provider's data is OSM) so the screen is
  // never credit-less.
  let links
  let names
  if (provider === 'openfreemap' && !clean(env.VITE_MAP_ATTRIBUTION)) {
    ;({ links, names } = PROVIDER_CREDITS.openfreemap)
  } else {
    const custom = parseAttribution(env.VITE_MAP_ATTRIBUTION)
    links = [...custom, OSM_LINK]
    names = [
      'OpenStreetMap contributors',
      ...custom.map((c) => c.label.replace(/^©\s*/, '')),
    ]
  }

  const styleHost = hostOf(template.replace('{style}', 'x'))
  const transformRequest = apiKey
    ? (url) =>
        styleHost && hostOf(url) === styleHost
          ? { url: withApiKey(url, apiKey, apiKeyParam) }
          : { url }
    : undefined

  const routingProvider =
    clean(env.VITE_ROUTING_PROVIDER).toLowerCase() === 'none' ? 'none' : 'osrm'

  return {
    provider,
    styles,
    // Fallback for components given no style (never the case from GamePage).
    defaultStyleUrl: styles[0]?.styleUrl || '',
    transformRequest,
    attribution: { links, names },
    // "© OpenStreetMap contributors · OpenMapTiles · OpenFreeMap"
    creditLine: `© ${names.join(' · ')}`,
    // "Map data © OpenStreetMap contributors, OpenMapTiles, OpenFreeMap"
    creditText: `Map data © ${names.join(', ')}`,
    rasterTiles: {
      url: withApiKey(
        clean(env.VITE_MAP_RASTER_URL) || OSM_RASTER_URL,
        clean(env.VITE_MAP_RASTER_URL) ? apiKey : '',
        apiKeyParam
      ),
      attributionHtml: clean(env.VITE_MAP_RASTER_URL)
        ? links
            .map((l) =>
              l.href
                ? `${l.prefix}<a href="${l.href}">${l.label}</a>`
                : `${l.prefix}${l.label}`
            )
            .join(' ')
        : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
    routing: {
      provider: routingProvider,
      enabled: routingProvider !== 'none',
      baseUrl: (clean(env.VITE_ROUTING_URL) || OSRM_DEMO_URL).replace(
        /\/+$/,
        ''
      ),
      apiKey: clean(env.VITE_ROUTING_API_KEY),
      apiKeyParam: clean(env.VITE_ROUTING_API_KEY_PARAM) || 'key',
    },
  }
}

export const mapConfig = resolveMapConfig(import.meta.env)
