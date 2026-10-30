// Central hook for game UI sound effects. No audio files ship yet - every
// call site below is already wired to the right moment (button tap, a
// successful action, a coin pickup, an error banner), so dropping in real
// <audio>/Web Audio playback later is a one-file change instead of hunting
// through every component that should make noise.
const SOUND_KEYS = ['tap', 'success', 'coin', 'error']

function noop() {}

const players = {
  tap: noop,
  success: noop,
  coin: noop,
  error: noop,
}

// Call once, e.g. from main.jsx, to wire real playback:
//   registerGameSounds({ tap: () => tapAudio.play(), ... })
export function registerGameSounds(overrides) {
  SOUND_KEYS.forEach((key) => {
    if (typeof overrides[key] === 'function') players[key] = overrides[key]
  })
}

export function useGameSound() {
  return {
    playTap: () => players.tap(),
    playSuccess: () => players.success(),
    playCoin: () => players.coin(),
    playError: () => players.error(),
  }
}
