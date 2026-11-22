// UI sound effects - most buttons get a synthesized crisp/dry click (see
// the 'tap' player below), the hamburger/radial menu button gets a real
// bubbly sample instead ('menu'), and the milestone chime is its own
// synthesized two-note tone ('chime'). Kept separate from the background
// music in GamePage.jsx, which is its own real <audio> loop controlled by
// its own Music setting - this file is only ever the Sound setting's
// concern, never music's.
//
// playSfx(name) is the one place every effect actually gets played from -
// it's the single spot that checks the Sound setting before anything
// plays, so a future effect just needs a new entry in SFX_PLAYERS below to
// get muting, persistence and "stop what's currently playing" for free,
// per the brief this was built against.
import {
  getAudioContext,
  getBus,
  getBusVolume,
  resumeAudio,
  routeElement,
  setBusVolume,
} from './audioGraph'
import { saveVolume } from './audioSettings'

// The Sound setting is a 0-100 volume now (see utils/audioSettings.js; the
// old on/off flag is migrated there). Every effect ends up in the shared
// "sfx" bus (utils/audioGraph.js), so the one slider scales all of them live,
// including on iOS where an <audio> element's own .volume does nothing.
// 0 = muted: playSfx returns before anything is created.
export function getSfxVolume() {
  return getBusVolume('sfx')
}

export function isSfxMuted() {
  return getSfxVolume() <= 0
}

// Settings' Sound slider calls this on every change: persists, applies live
// and - at 0 - cuts off whatever is mid-effect right now.
export function setSfxVolume(value) {
  const v = saveVolume('sfx', value)
  setBusVolume('sfx', v)
  if (v <= 0) stopActiveSfx()
  return v
}

// Browsers refuse to start (or auto-resume) an AudioContext before a user
// gesture; the shared graph resumes it on the first one (see audioGraph.js).
function getContext() {
  const c = getAudioContext()
  if (c) resumeAudio()
  return c
}

// Every oscillator/noise source node currently sounding - tracked so
// setSfxMuted(true) mid-effect can actually stop them (stopActiveSfx
// below), not just block the next one. Self-removes via onended once a
// node finishes naturally, so this never grows unbounded.
const activeNodes = new Set()

function registerActive(node) {
  activeNodes.add(node)
  node.onended = () => activeNodes.delete(node)
}

function stopActiveSfx() {
  for (const node of activeNodes) {
    try {
      node.stop()
    } catch {
      // Already stopped/ended - stop() throws on an already-stopped node.
    }
  }
  activeNodes.clear()
  // The menu sample is a plain <audio>, not a Web Audio node - pause it
  // directly rather than trying to route it through the set above.
  menuAudio?.pause()
  stopPops()
}

function tone({ freq, duration, startAt = 0, type = 'sine', peakGain = 0.1 }) {
  const audioCtx = getContext()
  if (!audioCtx) return
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.type = type
  osc.frequency.value = freq
  const now = audioCtx.currentTime + startAt
  // Linear attack then an exponential decay to (near) silence — a hard stop
  // at 0 gain would click; ramping to 0 isn't allowed by the Web Audio spec.
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(peakGain, now + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  osc.connect(gain)
  gain.connect(getBus('sfx') || audioCtx.destination)
  osc.start(now)
  osc.stop(now + duration + 0.02)
  registerActive(osc)
}

// A short burst of filtered white noise - the standard way to synthesize a
// "crisp" click/tap texture (mechanical keyboard switch, pen click, that
// ASMR tapping sound) without shipping an actual audio sample. High-passed
// so it reads as a dry snap rather than a thump.
function noiseBurst({
  duration,
  startAt = 0,
  filterFreq = 4500,
  peakGain = 0.2,
}) {
  const audioCtx = getContext()
  if (!audioCtx) return
  const now = audioCtx.currentTime + startAt
  const frameCount = Math.max(1, Math.floor(audioCtx.sampleRate * duration))
  const buffer = audioCtx.createBuffer(1, frameCount, audioCtx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frameCount; i++) {
    data[i] = Math.random() * 2 - 1
  }
  const noise = audioCtx.createBufferSource()
  noise.buffer = buffer

  const filter = audioCtx.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = filterFreq

  const gain = audioCtx.createGain()
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(peakGain, now + 0.003)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

  noise.connect(filter)
  filter.connect(gain)
  gain.connect(getBus('sfx') || audioCtx.destination)
  noise.start(now)
  noise.stop(now + duration + 0.02)
  registerActive(noise)
}

// A real sample (public/audio/button-click.mp3, a "bubble pop" SFX) used
// only for the hamburger/radial menu button - resetting currentTime and
// replaying the same element on each call rather than a fresh `new Audio()`
// every tap, since menu open/close fires often.
const MENU_SOUND_URL = `${import.meta.env.BASE_URL}audio/button-click.mp3`
let menuAudio = null
function getMenuAudio() {
  if (typeof window === 'undefined') return null
  if (!menuAudio) {
    menuAudio = new Audio(MENU_SOUND_URL)
    menuAudio.volume = 0.5 // replaced by the bus gain once routed
  }
  return menuAudio
}

// Pop-up "pop": the same bubble sample as the menu button, cut short (the
// file is ~0.9s, a pop-up opening should be a quick blip) and played from a
// small pool of preloaded elements so two close pops don't cut each other
// off and nothing is created at play time.
const POP_PLAY_MS = 380
const POP_POOL_SIZE = 2
let popPool = null
let popNext = 0
function getPopAudio() {
  if (typeof window === 'undefined') return null
  if (!popPool) {
    popPool = Array.from({ length: POP_POOL_SIZE }, () => {
      const a = new Audio(MENU_SOUND_URL)
      a.volume = 0.5 // replaced by the bus gain once routed
      a.preload = 'auto'
      return a
    })
  }
  const audio = popPool[popNext]
  popNext = (popNext + 1) % popPool.length
  return audio
}

// Creates the preloaded elements up front (call once the game screen is up)
// so the first tap/pop doesn't wait on a fetch + decode.
export function preloadSfx() {
  getMenuAudio()?.load?.()
  if (!popPool) {
    getPopAudio()
    getPopAudio()
  }
}

function stopPops() {
  popPool?.forEach((a) => {
    clearTimeout(a._popStop)
    a.pause()
  })
}

// Every named effect playSfx can trigger. Add a new key here (and call
// playSfx with it) for a future effect - it gets muting/persistence/stop-
// on-mute for free, nothing else to wire.
const SFX_PLAYERS = {
  // A crisp, textured tap for ordinary button presses - a high-passed
  // noise burst layered with a very brief high tone for a touch of pitched
  // body, rather than a flat synth-tone beep.
  tap() {
    noiseBurst({ duration: 0.035, filterFreq: 4500, peakGain: 0.22 })
    tone({ freq: 1800, duration: 0.02, type: 'triangle', peakGain: 0.05 })
  },
  pop() {
    const audio = getPopAudio()
    if (!audio) return
    clearTimeout(audio._popStop)
    routeElement(audio, 'sfx', 0.5)
    audio.currentTime = 0
    audio.play().catch(() => {})
    audio._popStop = setTimeout(() => audio.pause(), POP_PLAY_MS)
  },
  menu() {
    const audio = getMenuAudio()
    if (!audio) return
    routeElement(audio, 'sfx', 0.5)
    audio.currentTime = 0
    audio.play().catch(() => {})
  },
  // A short pitched blip: the sample the Sound slider plays on release so
  // the player hears the level they picked.
  tick() {
    tone({ freq: 1320, duration: 0.07, type: 'triangle', peakGain: 0.3 })
  },
  // A brighter rising two-note chime, reused for every "something just
  // happened" alert: a run's 1km distance milestones, a club-war phase
  // change, and an incoming PvP challenge (see GamePage.jsx's own call
  // sites) - one sound, three events, not three separate chimes.
  chime() {
    tone({ freq: 880, duration: 0.18, type: 'sine', peakGain: 0.14 })
    tone({
      freq: 1174.66,
      duration: 0.24,
      startAt: 0.1,
      type: 'sine',
      peakGain: 0.14,
    })
  },
}

// The one place any UI sound effect actually gets played from - checks the
// Sound setting first, so nothing downstream (GamePage.jsx's delegated
// click handler, the milestone-chime effect, ...) needs its own mute
// check. Unknown names are silently ignored (same "missing sound is not a
// crash" posture play() calls elsewhere in this file already take).
export function playSfx(name) {
  if (isSfxMuted()) return
  SFX_PLAYERS[name]?.()
}
