/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { IconChevronLeft, IconSwords, IconUser } from '../GameIcons'
import Avatar from '../../game/ui/Avatar'
import HeroStage from '../HeroStage'
import HeroSprite from '../HeroSprite'
import { hasHero } from '../../utils/heroManifest'
import { STEPS } from '../../utils/pvpCopy'

// Small presentational pieces of the PvP arena (PvpPanel.jsx). No logic here.

// The game's gold coin, inline with text. Gold is only ever used for coins
// and stakes in the arena.
export function Coin({ className = '' }) {
  return (
    <span
      className={`pvp-coin ${className}`}
      role="img"
      aria-label="Fahhcoin"
    />
  )
}

// Back control for the steps of the flow (the header itself is the shared
// pill header GamePage renders for every menu section).
export function BackRow({ onBack, label = 'Back' }) {
  return (
    <button type="button" className="pvp-back" onClick={onBack}>
      <IconChevronLeft />
      <span>{label}</span>
    </button>
  )
}

// "1 Distance - 2 Rival - 3 Stake - 4 Go": which step the player is on.
export function StepRail({ step }) {
  return (
    <ol className="pvp-steps" aria-label={`Step ${step} of ${STEPS.length}`}>
      {STEPS.map((label, i) => {
        const n = i + 1
        return (
          <li
            key={label}
            className={n < step ? 'is-done' : n === step ? 'is-now' : ''}
            aria-current={n === step ? 'step' : undefined}
          >
            <span className="pvp-step-dot pvp-num" aria-hidden="true">
              {n < step ? '✓' : n}
            </span>
            <span className="pvp-step-label">{label}</span>
          </li>
        )
      })}
    </ol>
  )
}

// A rival as a card avatar: their photo / initial, or the "?" silhouette
// while they are still unknown.
export function RivalFigure({ name, src, size = 72, unknown = false }) {
  if (unknown) {
    return (
      <span
        className="pvp-silhouette"
        style={{ '--s': `${size}px` }}
        role="img"
        aria-label="Rival not found yet"
      >
        <IconUser />
        <span className="pvp-silhouette-q pvp-display" aria-hidden="true">
          ?
        </span>
      </span>
    )
  }
  return <Avatar name={name} src={src} size={size} ring="#4da3ff" />
}

// Your side of a VS banner: the animated hero when it has art, else your
// profile photo / initial.
export function YouFigure({ heroName, avatarSrc, name, size = 72 }) {
  if (heroName && hasHero(heroName)) {
    return (
      <span className="pvp-hero-fig" style={{ '--s': `${size * 1.35}px` }}>
        <HeroStage hero={heroName} className="pvp-hero-stage">
          {(h) => <HeroSprite size={h || size} hero={heroName} />}
        </HeroStage>
      </span>
    )
  }
  return (
    <Avatar name={name || 'You'} src={avatarSrc} size={size} ring="#6fdc82" />
  )
}

// The "VS" motif: a hex badge with a faint crossed-swords behind it.
export function VsBadge({ small = false }) {
  return (
    <span className={`pvp-vs${small ? ' is-small' : ''}`} aria-hidden="true">
      <IconSwords className="pvp-vs-swords" />
      <span className="pvp-vs-text pvp-display">VS</span>
    </span>
  )
}

// The two sides of a duel with the VS badge between them.
export function VsStage({ you, rival, youLabel = 'You', rivalLabel, compact }) {
  return (
    <div className={`pvp-vs-stage${compact ? ' is-compact' : ''}`}>
      <div className="pvp-vs-side">
        {you}
        <span className="pvp-vs-name pvp-display">{youLabel}</span>
      </div>
      <VsBadge small={compact} />
      <div className="pvp-vs-side">
        {rival}
        <span className="pvp-vs-name pvp-display">{rivalLabel}</span>
      </div>
    </div>
  )
}

export function StatusChip({ label, tone = 'slate' }) {
  return <span className={`pvp-chip is-${tone}`}>{label}</span>
}

// Empty state illustration: a small arena with a faint "?" rival.
export function ArenaEmptyArt() {
  return (
    <svg
      className="pvp-empty-art"
      viewBox="0 0 160 96"
      role="img"
      aria-label="An empty arena"
    >
      <ellipse cx="80" cy="76" rx="64" ry="14" fill="rgba(77,163,255,0.18)" />
      <ellipse
        cx="80"
        cy="76"
        rx="44"
        ry="8"
        fill="none"
        stroke="rgba(77,163,255,0.55)"
        strokeWidth="2"
      />
      <g fill="none" stroke="#9db8ff" strokeWidth="3.5" strokeLinecap="round">
        <path d="M58 22l30 30M62 52L92 22" opacity="0.9" />
        <path d="M54 18l8 4-4 8M96 18l-8 4 4 8" opacity="0.9" />
      </g>
      <circle
        cx="80"
        cy="38"
        r="26"
        fill="none"
        stroke="rgba(157,184,255,0.25)"
        strokeWidth="2"
        strokeDasharray="4 6"
      />
    </svg>
  )
}
