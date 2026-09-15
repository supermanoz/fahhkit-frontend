// Synthesized UI sound effects (Web Audio API oscillators) — no extra audio
// files to ship for these, just short generated tones. Kept separate from
// the background music in GamePage.jsx, which is a real <audio> loop.
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

// A short, dry tick for any button press — the game's whole HUD is chunky
// carved-stone/wood buttons, so this stays percussive rather than musical.
export function playClickSound() {
  tone({ freq: 660, duration: 0.06, type: 'square', peakGain: 0.06 })
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
