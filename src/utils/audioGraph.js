// One shared Web Audio graph for the whole game:
//
//   element / oscillator ... -> [per-source gain] -> bus (music | sfx) -> speakers
//
// Why: HTMLAudioElement.volume is ignored on iOS WebKit (always 1), so a
// volume slider needs a GainNode. Music (<audio loop>) and the sampled
// effects (menu / pop) are routed through MediaElementSource nodes into the
// bus; the synthesised effects (oscillators / noise) connect to the bus
// directly. The element keeps playing exactly as before (same loop attribute,
// same play()/pause() calls, same autoplay-unlock retries) - only where its
// sound goes changed, and a routed element no longer reaches the speakers
// directly, so nothing plays twice.
//
// If Web Audio is missing or routing throws, the element's own .volume is
// used instead (right on every browser except iOS).
import { clampVolume, readVolume } from './audioSettings'

const volumes = { music: readVolume('music'), sfx: readVolume('sfx') }
const buses = { music: null, sfx: null }
const fallbacks = new Set() // { audio, kind, base }
let ctx = null
let unlockInstalled = false

export function getAudioContext() {
  if (ctx) return ctx
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext || window.webkitAudioContext
  if (!Ctor) return null
  try {
    ctx = new Ctor()
  } catch {
    return null
  }
  installUnlock()
  return ctx
}

// Browsers keep a new context "suspended" until a user gesture (iOS can also
// "interrupt" it after backgrounding). Safe to call any time.
export function resumeAudio() {
  const c = ctx || getAudioContext()
  if (!c || c.state === 'running') return
  try {
    const p = c.resume()
    p?.catch?.(() => {})
  } catch {
    // Not allowed yet - the gesture listeners below retry.
  }
}

// Resume on any real gesture while the context is not running (first tap in a
// plain browser tab, or after iOS interrupted it on backgrounding). The
// music's own play() retry only covers play() being rejected; a suspended
// context lets play() succeed silently, so this is the piece that actually
// makes the track audible. Cheap: one passive listener per event, no-op once
// the context is running.
function installUnlock() {
  if (unlockInstalled || typeof document === 'undefined') return
  unlockInstalled = true
  const onGesture = () => {
    if (ctx && ctx.state !== 'running') resumeAudio()
  }
  for (const e of ['pointerdown', 'touchend', 'click', 'keydown']) {
    document.addEventListener(e, onGesture, { capture: true, passive: true })
  }
}

export function isAudioRunning() {
  return !ctx || ctx.state === 'running'
}

// The channel's master GainNode (created on first use).
export function getBus(kind) {
  if (buses[kind]) return buses[kind]
  const c = getAudioContext()
  if (!c) return null
  const g = c.createGain()
  g.gain.value = volumes[kind] / 100
  g.connect(c.destination)
  buses[kind] = g
  return g
}

export function getBusVolume(kind) {
  return volumes[kind]
}

// Applies a 0-100 level live. A short ramp (not a jump) so dragging never
// produces zipper clicks.
export function setBusVolume(kind, value) {
  const v = clampVolume(value)
  volumes[kind] = v
  const bus = buses[kind]
  if (bus && ctx) {
    const now = ctx.currentTime
    try {
      bus.gain.cancelScheduledValues(now)
      bus.gain.setTargetAtTime(v / 100, now, 0.015)
    } catch {
      bus.gain.value = v / 100
    }
  }
  fallbacks.forEach((f) => {
    if (f.kind === kind) f.audio.volume = Math.min(1, (f.base * v) / 100)
  })
}

// Routes an <audio> element into a bus. `base` is the element's own level
// relative to the bus (e.g. the menu pop plays at 0.5). Idempotent. Returns
// true when routed through Web Audio.
export function routeElement(audio, kind, base = 1) {
  if (!audio) return false
  if (audio.__routed) return true
  const c = getAudioContext()
  const bus = c && getBus(kind)
  if (c && bus && typeof c.createMediaElementSource === 'function') {
    try {
      const source = c.createMediaElementSource(audio)
      const gain = c.createGain()
      gain.gain.value = base
      source.connect(gain)
      gain.connect(bus)
      // The element now feeds the graph at full scale; the gains above set
      // the level (its own .volume would be ignored on iOS anyway).
      audio.volume = 1
      audio.__routed = true
      return true
    } catch {
      // e.g. already captured by another source - fall through.
    }
  }
  if (!audio.__fallback) {
    audio.__fallback = true
    fallbacks.add({ audio, kind, base })
  }
  audio.volume = Math.min(1, (base * volumes[kind]) / 100)
  return false
}

// Test helper: forget the context and every node.
export function __resetAudioGraphForTests() {
  ctx = null
  buses.music = null
  buses.sfx = null
  fallbacks.clear()
  unlockInstalled = false
  volumes.music = readVolume('music')
  volumes.sfx = readVolume('sfx')
}
