// Music / Sound-effects volume: storage, defaults and the old on/off migration.
// Pure (just localStorage) so it is unit-testable and safe to import anywhere.
//
// Volumes are whole numbers 0-100. 0 means muted. Muting remembers the level
// you had ("last audible") so the speaker button can put it back.
//
// Migration: before sliders there was only an on/off flag per channel
// (`..._muted` = 'true' | 'false'). With no saved volume yet:
//   - flag 'true'  -> volume 0 (stays silent), remembered level = the default
//   - anything else -> the default (music 35 = the old fixed 0.35 element
//     volume; sound 100 = the old effect levels untouched)
// The old keys are only ever read, never rewritten, so nothing is lost.

export const MUSIC_MUTED_KEY = 'fahhkit_territory_music_muted' // legacy
export const SFX_MUTED_KEY = 'fahhkit_territory_sfx_muted' // legacy
export const MUSIC_VOLUME_KEY = 'fahhkit_territory_music_volume'
export const SFX_VOLUME_KEY = 'fahhkit_territory_sfx_volume'
const MUSIC_LAST_KEY = 'fahhkit_territory_music_volume_last'
const SFX_LAST_KEY = 'fahhkit_territory_sfx_volume_last'

export const DEFAULT_VOLUME = Object.freeze({ music: 35, sfx: 100 })

const KEYS = {
  music: {
    volume: MUSIC_VOLUME_KEY,
    last: MUSIC_LAST_KEY,
    legacy: MUSIC_MUTED_KEY,
  },
  sfx: { volume: SFX_VOLUME_KEY, last: SFX_LAST_KEY, legacy: SFX_MUTED_KEY },
}

export function clampVolume(value) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n))
}

function read(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // No storage: the choice just won't survive a restart.
  }
}

// null for "not saved / not a number" (an empty string is NOT 0).
function parseSaved(raw) {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? clampVolume(n) : null
}

export function readVolume(kind) {
  const k = KEYS[kind]
  const saved = parseSaved(read(k.volume))
  if (saved != null) return saved
  return read(k.legacy) === 'true' ? 0 : DEFAULT_VOLUME[kind]
}

// The level the speaker button restores: the last non-zero one, else default.
export function readLastAudible(kind) {
  const last = parseSaved(read(KEYS[kind].last))
  return last && last > 0 ? last : DEFAULT_VOLUME[kind]
}

// Persists immediately. A non-zero level is also remembered as the one to
// restore after a mute.
export function saveVolume(kind, value) {
  const v = clampVolume(value)
  const k = KEYS[kind]
  write(k.volume, v)
  if (v > 0) write(k.last, v)
  return v
}

// The next volume for a tap on the speaker: audible -> 0 (remembering where
// it was), muted -> back to the remembered level.
export function toggledVolume(kind, current) {
  if (current > 0) {
    write(KEYS[kind].last, current)
    return 0
  }
  return readLastAudible(kind)
}

// Which speaker glyph: muted | low | high.
export function volumeLevel(value) {
  if (value <= 0) return 'muted'
  return value < 50 ? 'low' : 'high'
}
