// Real-world "sky" for the Territory Run map - replaces the old manual
// dark/light toggle. The map's look follows the player's actual local
// weather and sun position instead: shiny on a clear afternoon, a touch
// muted under overcast, inverted at night, warm around sunrise/sunset, with
// rain/snow/fog/storm overlays on top (see TerritoryMap.css .territory-map-sky).
//
// Weather comes from Open-Meteo - free, keyless and CORS-enabled, so it can
// be called straight from the browser with no backend involvement.

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast'

// How long either side of sunrise/sunset counts as dawn/dusk (golden hour).
const TWILIGHT_WINDOW_SECONDS = 45 * 60

export async function fetchSkyConditions(lat, lng, { signal } = {}) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    current: 'weather_code,is_day,temperature_2m,cloud_cover',
    daily: 'sunrise,sunset',
    timezone: 'auto',
    timeformat: 'unixtime',
    forecast_days: '1',
  })
  const res = await fetch(`${OPEN_METEO_URL}?${params}`, { signal })
  if (!res.ok) throw new Error(`Weather lookup failed (${res.status})`)
  const data = await res.json()
  return {
    weatherCode: data.current?.weather_code ?? null,
    isDay: data.current?.is_day === 1,
    temperature: data.current?.temperature_2m ?? null,
    sunrise: data.daily?.sunrise?.[0] ?? null,
    sunset: data.daily?.sunset?.[0] ?? null,
  }
}

// WMO weather interpretation codes -> the handful of looks the map has.
function skyFromWeatherCode(code) {
  if (code == null) return 'partly'
  if (code <= 1) return 'clear'
  if (code === 2) return 'partly'
  if (code === 3) return 'overcast'
  if (code === 45 || code === 48) return 'fog'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'storm'
  return 'partly'
}

function phaseFromSun(nowSeconds, sunrise, sunset, isDayFallback) {
  if (sunrise == null || sunset == null) {
    if (isDayFallback != null) return isDayFallback ? 'day' : 'night'
    // No weather data at all - rough guess from the device clock.
    const hour = new Date(nowSeconds * 1000).getHours()
    if (hour >= 6 && hour < 7) return 'dawn'
    if (hour >= 18 && hour < 19) return 'dusk'
    return hour >= 7 && hour < 18 ? 'day' : 'night'
  }
  if (Math.abs(nowSeconds - sunrise) <= TWILIGHT_WINDOW_SECONDS) return 'dawn'
  if (Math.abs(nowSeconds - sunset) <= TWILIGHT_WINDOW_SECONDS) return 'dusk'
  return nowSeconds > sunrise && nowSeconds < sunset ? 'day' : 'night'
}

// Filters stack left to right, so each phase sets the base mood and the
// weather nudges it from there. Night is the old dark mode's inversion -
// OpenFreeMap's own dark style breaks the label logic (see mapStyles.js).
// Weather is a hint, not a mood - kept light so the map never reads as
// gloomy (dimming/desaturating it hard made overcast days look dead).
const PHASE_FILTERS = {
  day: 'saturate(1.45) contrast(1.08) brightness(1.05)',
  dawn: 'sepia(0.15) saturate(1.4) hue-rotate(-8deg) brightness(1.04)',
  dusk: 'sepia(0.25) saturate(1.4) hue-rotate(-12deg) brightness(0.98) contrast(1.04)',
  night:
    'invert(1) hue-rotate(180deg) brightness(1.08) contrast(1.02) saturate(1.3)',
}

const SKY_FILTERS = {
  clear: 'saturate(1.12) brightness(1.05)',
  partly: '',
  overcast: 'saturate(0.95)',
  fog: 'saturate(0.92) contrast(0.96) brightness(1.03)',
  rain: 'saturate(0.92) brightness(0.98)',
  snow: 'saturate(0.92) brightness(1.06)',
  storm: 'saturate(0.85) brightness(0.93)',
}

const SKY_LABELS = {
  clear: {
    day: ['☀️', "Sun's out, legs out"],
    night: ['🌙', 'Clear night run'],
  },
  partly: {
    day: ['⛅', 'Bit of cloud, all go'],
    night: ['☁️', 'Cloudy night'],
  },
  overcast: { day: ['☁️', 'Gloomy. Run anyway'], night: ['☁️', 'Moody night'] },
  fog: { day: ['🌫️', 'Foggy - stay sharp'], night: ['🌫️', 'Fog after dark'] },
  rain: { day: ['🌧️', 'Wet run incoming'], night: ['🌧️', 'Rainy night'] },
  snow: { day: ['❄️', 'Snow run, legend'], night: ['❄️', 'Snowy night'] },
  storm: { day: ['⛈️', 'Storm out there'], night: ['⛈️', 'Stormy night'] },
}

const PHASE_LABELS = {
  dawn: ['🌅', 'Sunrise run'],
  dusk: ['🌇', 'Golden hour'],
}

export function describeAmbience(conditions, now = Date.now()) {
  const nowSeconds = Math.floor(now / 1000)
  const phase = phaseFromSun(
    nowSeconds,
    conditions?.sunrise,
    conditions?.sunset,
    conditions ? conditions.isDay : null
  )
  const sky = skyFromWeatherCode(conditions?.weatherCode)
  const filter = [PHASE_FILTERS[phase], SKY_FILTERS[sky]]
    .filter(Boolean)
    .join(' ')
  // Twilight only headlines the chip when the sky is clear-ish enough to
  // actually see it - a stormy sunset is still a storm.
  const [emoji, label] =
    PHASE_LABELS[phase] && (sky === 'clear' || sky === 'partly')
      ? PHASE_LABELS[phase]
      : SKY_LABELS[sky][phase === 'night' ? 'night' : 'day']
  return {
    phase,
    sky,
    filter,
    emoji,
    label,
    temperature:
      conditions?.temperature != null
        ? Math.round(conditions.temperature)
        : null,
  }
}

// One-off hype line shown right after the game loads (see GamePage's
// weather pop-up) - picks a random line for the current conditions so it
// doesn't read the same every session. Very cold/hot temperatures beat the
// sky, since "it's -3°" is the more useful thing to hear.
const WEATHER_HYPE = {
  freezing: [
    ['🥶', 'Freezing out there', 'Fk the cold. Your legs make their own heat.'],
    ['🧤', 'Winter mode: ON', 'Gloves on, excuses off. Go claim something.'],
  ],
  scorching: [
    [
      '🔥',
      "It's scorching",
      'Hot run, hotter territory. Bring water, fk the heat.',
    ],
    ['🥵', 'Sweat season', 'Sun wants a fight. Outrun it.'],
  ],
  clear: [
    ['☀️', "Sun's out, legs out", 'Perfect weather. Zero excuses. Go.'],
    ['😎', 'Blue skies', 'Too nice to sit inside. Fk it, run.'],
  ],
  partly: [
    ['⛅', 'Bit of cloud', 'Not too hot, not too cold. Just run, fk it.'],
    ['🌤️', 'Solid running weather', 'The sky did its part. Your turn.'],
  ],
  overcast: [
    ['☁️', 'Gloomy out', 'Grey skies, bright territory. Fk the gloom.'],
    ['🌥️', 'Moody weather', "Sky's sulking. You don't have to."],
  ],
  fog: [
    ['🌫️', 'Foggy out', "Can't see far? Nobody can see you steal their land."],
  ],
  rain: [
    ['🌧️', "It's raining", 'Run even in the rain, fk it. Wet socks, big wins.'],
    ['☔', 'Rain check? Nah', "You're waterproof. Fk the rain, go claim."],
  ],
  snow: [['❄️', "It's snowing", 'Snow run = legend status. Fk it, go.']],
  storm: [
    [
      '⛈️',
      'Storm out there',
      'Lightning is real - maybe wait this one out, legend.',
    ],
  ],
  night: [
    ['🌙', 'Night run', 'Streets are empty. Territory is waiting. Fk it.'],
  ],
  dawn: [
    ['🌅', 'Sunrise run', "Up before the rest? They'll wake up to your flag."],
  ],
  dusk: [['🌇', 'Golden hour', 'Best light of the day. Make it a lap.']],
}

export function pickWeatherHype(ambience) {
  const temp = ambience?.temperature
  let key = ambience?.sky || 'partly'
  if (temp != null && temp <= 3 && key !== 'storm') key = 'freezing'
  else if (temp != null && temp >= 32 && key !== 'storm') key = 'scorching'
  else if (key === 'clear' || key === 'partly') {
    // Clear skies aren't news at night/twilight - the time of day is.
    if (ambience?.phase !== 'day') key = ambience.phase
  }
  const options = WEATHER_HYPE[key] || WEATHER_HYPE.partly
  const [emoji, title, line] =
    options[Math.floor(Math.random() * options.length)]
  return { emoji, title, line }
}
