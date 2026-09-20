// UI sound effects - most buttons get a synthesized crisp/dry click (see
// playClickSound), the hamburger/radial menu button gets a real bubbly
// sample instead (see playMenuSound), and the milestone chime is its own
// synthesized two-note tone. Kept separate from the background music in
// GamePage.jsx, which is its own real <audio> loop.
let ctx = null

// Browsers refuse to start (or auto-resume) an AudioContext before a user
// gesture, so this is only ever created lazily from inside a click handler.
function getContext() {
  if (typeof window === 'undefined') return null
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return null
  if (!ctx) ctx = new AudioContextClass()
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
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
  gain.connect(audioCtx.destination)
  osc.start(now)
  osc.stop(now + duration + 0.02)
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
  gain.connect(audioCtx.destination)
  noise.start(now)
  noise.stop(now + duration + 0.02)
}

// A crisp, textured tap for ordinary button presses - a high-passed noise
// burst layered with a very brief high tone for a touch of pitched body,
// rather than a flat synth-tone beep.
export function playClickSound() {
  noiseBurst({ duration: 0.035, filterFreq: 4500, peakGain: 0.22 })
  tone({ freq: 1800, duration: 0.02, type: 'triangle', peakGain: 0.05 })
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
    menuAudio.volume = 0.5
  }
  return menuAudio
}

export function playMenuSound() {
  const audio = getMenuAudio()
  if (!audio) return
  audio.currentTime = 0
  audio.play().catch(() => {})
}

// A brighter rising two-note chime for hitting a new km milestone mid-run.
export function playMilestoneChime() {
  tone({ freq: 880, duration: 0.18, type: 'sine', peakGain: 0.14 })
  tone({
    freq: 1174.66,
    duration: 0.24,
    startAt: 0.1,
    type: 'sine',
    peakGain: 0.14,
  })
}
