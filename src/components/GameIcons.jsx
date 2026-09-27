/* eslint-disable react/prop-types -- no prop-types dependency in this project */
// The game's UI icon set, drawn to Apple's HIG / SF Symbols conventions
// instead of mixing Font Awesome, Bootstrap and game-icons.net glyphs:
// one 24x24 grid, one 2.25px stroke weight everywhere, round caps and joins,
// no gradients or shading. Color is always currentColor, so an icon takes
// the tint of whatever badge/button it sits in (and adapts with it); the
// main shape gets an optional second tone - the same tint at low opacity,
// like SF Symbols' "hierarchical" rendering - rather than a second color.
// Drop-in for react-icons: sized 1em, className passes through.

const TINT = { fill: 'currentColor', fillOpacity: 0.3 }
const SOLID = { fill: 'currentColor', stroke: 'none' }

function GameIcon({ className, children, ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ? `game-icon ${className}` : 'game-icon'}
      {...props}
    >
      {children}
    </svg>
  )
}

export function IconTrophy(props) {
  return (
    <GameIcon {...props}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" {...TINT} />
      <path d="M7 5.5H4.5v1a3.5 3.5 0 0 0 3 3.5M17 5.5h2.5v1a3.5 3.5 0 0 1-3 3.5" />
      <path d="M12 14v6M8 20h8" />
    </GameIcon>
  )
}

export function IconUser(props) {
  return (
    <GameIcon {...props}>
      <circle cx="12" cy="8" r="4" {...TINT} />
      <path d="M4 20.5a8 8 0 0 1 16 0z" {...TINT} />
    </GameIcon>
  )
}

export function IconUsers(props) {
  return (
    <GameIcon {...props}>
      <circle cx="9" cy="8" r="3.5" {...TINT} />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0z" {...TINT} />
      <path d="M15.5 4.6a3.5 3.5 0 0 1 0 6.8M17.5 13.8a6.5 6.5 0 0 1 4 6.2" />
    </GameIcon>
  )
}

export function IconStore(props) {
  return (
    <GameIcon {...props}>
      <path d="M5 12v8h14v-8" />
      <path
        d="M3 9 4.5 4h15L21 9a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"
        {...TINT}
      />
      <path d="M10 20v-4.5h4V20" />
    </GameIcon>
  )
}

export function IconPlay(props) {
  return (
    <GameIcon {...props}>
      <path
        d="M8 5.8v12.4a1.2 1.2 0 0 0 1.8 1l9.9-6.2a1.2 1.2 0 0 0 0-2L9.8 4.8a1.2 1.2 0 0 0-1.8 1z"
        {...TINT}
      />
    </GameIcon>
  )
}

// Race (PvP) - two crossed blades, each with a crossguard and grip.
export function IconSwords(props) {
  return (
    <GameIcon {...props}>
      <path d="M20 4v3L10 17l-3-3L17 4z" {...TINT} />
      <path d="M4 4v3l10 10 3-3L7 4z" {...TINT} />
      <path d="M6 13l5 5M8.5 15.5 5 19M18 13l-5 5M15.5 15.5 19 19" />
    </GameIcon>
  )
}

export function IconEnvelope(props) {
  return (
    <GameIcon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" {...TINT} />
      <path d="m3.5 7.5 8.5 6 8.5-6" />
    </GameIcon>
  )
}

export function IconEnvelopeOpen(props) {
  return (
    <GameIcon {...props}>
      <path
        d="M3 10l9-6.5 9 6.5v8.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5z"
        {...TINT}
      />
      <path d="m3.5 10.5 8.5 5.5 8.5-5.5" />
    </GameIcon>
  )
}

export function IconGift(props) {
  return (
    <GameIcon {...props}>
      <rect x="4.5" y="11" width="15" height="9.5" rx="1.5" {...TINT} />
      <rect x="3" y="7.5" width="18" height="3.5" rx="1" />
      <path d="M12 7.5v13" />
      <path d="M12 7.5S10.5 3.5 8 4.2C6 4.8 7 7.5 9 7.5zM12 7.5s1.5-4 4-3.3c2 .6 1 3.3-1 3.3z" />
    </GameIcon>
  )
}

export function IconMegaphone(props) {
  return (
    <GameIcon {...props}>
      <path d="M3 10v4a1 1 0 0 0 1 1h3l9 5V4L7 9H4a1 1 0 0 0-1 1z" {...TINT} />
      <path d="m7 15 1.5 5M19.5 9.5a3.5 3.5 0 0 1 0 5" />
    </GameIcon>
  )
}

// Heroes - a Spartan helmet in profile (facing left, like the original):
// domed shell with neck guard, eye slot, cheek-guard line and plume crest.
export function IconHelmet(props) {
  return (
    <GameIcon {...props}>
      <path
        d="M6 12a7 7 0 0 1 14 0v6a2.5 2.5 0 0 1-2.5 2.5h-9L6 18z"
        {...TINT}
      />
      <path d="M6 14h4.5M13.5 20.5c0-2.5 1.3-4.5 3.5-5.5" />
      <path d="M7.5 7.5C8.5 4 11.5 2.5 15 3c3 .5 5.5 2.5 6.5 5.5" />
    </GameIcon>
  )
}

export function IconVolumeUp(props) {
  return (
    <GameIcon {...props}>
      <path
        d="M3.5 9.5v5a1 1 0 0 0 1 1h3l4.5 4v-15l-4.5 4h-3a1 1 0 0 0-1 1z"
        {...TINT}
      />
      <path d="M15.5 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
    </GameIcon>
  )
}

export function IconVolumeMute(props) {
  return (
    <GameIcon {...props}>
      <path
        d="M3.5 9.5v5a1 1 0 0 0 1 1h3l4.5 4v-15l-4.5 4h-3a1 1 0 0 0-1 1z"
        {...TINT}
      />
      <path d="m16 9.5 5 5M21 9.5l-5 5" />
    </GameIcon>
  )
}

export function IconFlag(props) {
  return (
    <GameIcon {...props}>
      <path d="M5.5 4.5h12l-2.5 4 2.5 4h-12z" {...TINT} />
      <path d="M5.5 21V3.5" />
    </GameIcon>
  )
}

export function IconFlagCheckered(props) {
  return (
    <GameIcon {...props}>
      <path d="M5.5 4.5h14v8h-14z" />
      <path
        d="M5.5 4.5h4.7v4H5.5zM14.8 4.5h4.7v4h-4.7zM10.2 8.5h4.6v4h-4.6z"
        {...SOLID}
      />
      <path d="M5.5 21V3.5" />
    </GameIcon>
  )
}

export function IconList(props) {
  return (
    <GameIcon {...props}>
      <circle cx="4.5" cy="6" r="1.5" {...SOLID} />
      <circle cx="4.5" cy="12" r="1.5" {...SOLID} />
      <circle cx="4.5" cy="18" r="1.5" {...SOLID} />
      <path d="M9 6h11M9 12h11M9 18h11" />
    </GameIcon>
  )
}

export function IconClose(props) {
  return (
    <GameIcon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </GameIcon>
  )
}

export function IconCheck(props) {
  return (
    <GameIcon {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </GameIcon>
  )
}

export function IconChevronDown(props) {
  return (
    <GameIcon {...props}>
      <path d="m6 9 6 6 6-6" />
    </GameIcon>
  )
}

export function IconChevronLeft(props) {
  return (
    <GameIcon {...props}>
      <path d="m15 6-6 6 6 6" />
    </GameIcon>
  )
}

export function IconChevronRight(props) {
  return (
    <GameIcon {...props}>
      <path d="m9 6 6 6-6 6" />
    </GameIcon>
  )
}

// Fahhcoin - a short stack behind one coin facing forward. (A tall even
// stack alone reads as SF Symbols' "cylinder" - a database - not money.)
export function IconCoins(props) {
  return (
    <GameIcon {...props}>
      <ellipse cx="9" cy="6" rx="6" ry="2.5" {...TINT} />
      <path d="M3 6v3.5C3 10.9 5.7 12 9 12M15 6v3M3 9.5V13c0 1.4 2.7 2.5 6 2.5" />
      <circle cx="15.5" cy="15.5" r="5.5" {...TINT} />
      <circle cx="15.5" cy="15.5" r="2.2" />
    </GameIcon>
  )
}

export function IconCrosshairs(props) {
  return (
    <GameIcon {...props}>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="1.5" {...SOLID} />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </GameIcon>
  )
}

export function IconRunning(props) {
  return (
    <GameIcon {...props}>
      <circle cx="15" cy="4.5" r="2" {...SOLID} />
      <path d="M13.5 8 11.5 13M13.5 8 9.5 9.5 8 12M13.5 8l2.5 3 3 .5M11.5 13l3 3-1 4.5M11.5 13l-2 4-4 .5" />
    </GameIcon>
  )
}

export function IconBolt(props) {
  return (
    <GameIcon {...props}>
      <path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z" {...TINT} />
    </GameIcon>
  )
}

export function IconLock(props) {
  return (
    <GameIcon {...props}>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" {...TINT} />
      <path d="M8 10.5v-3a4 4 0 0 1 8 0v3M12 14.5v2" />
    </GameIcon>
  )
}

export function IconSearch(props) {
  return (
    <GameIcon {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 4.5 4.5" />
    </GameIcon>
  )
}

export function IconDownload(props) {
  return (
    <GameIcon {...props}>
      <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
    </GameIcon>
  )
}

// Settings - an eight-tooth gear around a hub.
export function IconSettings(props) {
  return (
    <GameIcon {...props}>
      <path
        d="M19.1 13.2 21.3 14.3 20.2 17 17.9 16.1 16.1 17.9 17 20.2 14.3 21.3 13.2 19.1 10.8 19.1 9.7 21.3 7 20.2 7.9 17.9 6.1 16.1 3.8 17 2.7 14.3 4.9 13.2 4.9 10.8 2.7 9.7 3.8 7 6.1 7.9 7.9 6.1 7 3.8 9.7 2.7 10.8 4.9 13.2 4.9 14.3 2.7 17 3.8 16.1 6.1 17.9 7.9 20.2 7 21.3 9.7 19.1 10.8z"
        {...TINT}
      />
      <circle cx="12" cy="12" r="3" />
    </GameIcon>
  )
}

export function IconMap(props) {
  return (
    <GameIcon {...props}>
      <path
        d="M3.5 6.5l5.5-2.5 6 2.5 5.5-2.5v13.5l-5.5 2.5-6-2.5-5.5 2.5z"
        {...TINT}
      />
      <path d="M9 4v13.5M15 6.5V20" />
    </GameIcon>
  )
}
