/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import './AnimatedSprite.css'

// Generic "background-image strip + CSS steps() animation" renderer for
// any {src, frames, frameWidth, frameHeight} sheet - the frame math
// HeroFigure.jsx's hero-body poses and EmoteGlyph.jsx's emote poses both
// need, pulled out once here so neither duplicates it. `fast` swaps in
// the quicker run/charge-cycle pacing (125ms/frame) instead of the
// default relaxed-stretch pacing (150ms/frame) - same two speeds
// HeroFigure.jsx always used.
export default function AnimatedSprite({
  src,
  frames,
  frameWidth,
  frameHeight,
  height,
  fast = false,
  className = '',
}) {
  const width = Math.round((height * frameWidth) / frameHeight)
  const frameMs = fast ? 125 : 150
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
