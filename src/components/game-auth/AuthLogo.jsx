import { useEffect, useState } from 'react'
import runConquestLogo from '../../assets/ui/brand/run_conquest_logo-ui.webp'

// The Run Conquest logo for the game's auth card: hovers gently up and down
// over a soft ground shadow (transform/opacity keyframes only, see
// .game-auth-logo-float in GameAuth.css). Paused while the tab is hidden and
// off entirely under prefers-reduced-motion (CSS). The wrapper owns the
// logo's width/margin so the layout is exactly what the bare <img> had - the
// float is transform-only and never moves anything below it.
export default function AuthLogo() {
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    const sync = () => setPaused(document.hidden)
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])
  return (
    <div className={`game-auth-logo-float${paused ? ' is-paused' : ''}`}>
      <img
        src={runConquestLogo}
        alt="Run Conquest"
        className="game-auth-logo"
      />
    </div>
  )
}
