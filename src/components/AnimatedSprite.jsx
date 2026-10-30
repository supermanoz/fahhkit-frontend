/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import './AnimatedSprite.css'

// Generic "background-image strip + CSS steps() animation" renderer for
// any {src, frames, frameWidth, frameHeight} sheet - the frame math
// HeroFigure.jsx's hero-body poses and EmoteGlyph.jsx's emote poses both
// need, pulled out once here so neither duplicates it. `fast` swaps in
// the quicker run/charge-cycle pacing (125ms/frame) instead of the
// default relaxed-stretch pacing (150ms/frame) - same two speeds
// HeroFigure.jsx always used. `frameMs`, when given, overrides both and
// sets the per-frame duration directly - see EmoteGlyph.jsx, which needs
// its own pacing (matching the source capture's ~12-24fps) rather than
// HeroFigure's slower stretch-pose timing.
export default function AnimatedSprite({
  src,
  frames,
  frameWidth,
  frameHeight,
  height,
  fast = false,
  frameMs: frameMsProp,
  className = '',
}) {
  const width = Math.round((height * frameWidth) / frameHeight)
  const frameMs = frameMsProp ?? (fast ? 125 : 150)
  return (
    <span
      key={src}
      className={`animated-sprite ${fast ? 'is-fast' : ''} ${className}`}
      style={{
        width,
        height,
        backgroundImage: `url(${src})`,
        '--hero-strip-width': `${width * frames}px`,
        '--hero-frames': frames,
        animationDuration: `${frames * frameMs}ms`,
      }}
      aria-hidden="true"
    />
  )
}
