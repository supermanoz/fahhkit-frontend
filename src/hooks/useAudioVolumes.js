import { useCallback, useState } from 'react'
import { setBusVolume } from '../utils/audioGraph'
import { setSfxVolume } from '../utils/gameSound'
import { readVolume, saveVolume, toggledVolume } from '../utils/audioSettings'

// The Music + Sound sliders' state. Every change is saved immediately,
// applied live to the audio graph (no restart) and restored on the next
// launch. `musicMuted` / `sfxMuted` are just "volume is 0" - the old on/off
// meaning, so the music effect in GamePage still pauses the track at 0.
export function useAudioVolumes() {
  const [music, setMusic] = useState(() => readVolume('music'))
  const [sfx, setSfx] = useState(() => readVolume('sfx'))

  const changeMusic = useCallback((value) => {
    const v = saveVolume('music', value)
    setBusVolume('music', v)
    setMusic(v)
  }, [])

  const changeSfx = useCallback((value) => {
    setSfx(setSfxVolume(value))
  }, [])

  const toggleMusicMute = useCallback(
    () => changeMusic(toggledVolume('music', music)),
    [changeMusic, music]
  )
  const toggleSfxMute = useCallback(
    () => changeSfx(toggledVolume('sfx', sfx)),
    [changeSfx, sfx]
  )

  return {
    musicVolume: music,
    sfxVolume: sfx,
    musicMuted: music <= 0,
    sfxMuted: sfx <= 0,
    changeMusic,
    changeSfx,
    toggleMusicMute,
    toggleSfxMute,
  }
}
