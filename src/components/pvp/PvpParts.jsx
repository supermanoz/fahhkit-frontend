/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useCallback, useEffect, useState } from 'react'
import { IconChevronLeft, IconSwords, IconUser } from '../GameIcons'
import Avatar from '../../game/ui/Avatar'
import HeroStage from '../HeroStage'
import HeroSprite from '../HeroSprite'
import HeroFigure from '../HeroFigure'
import { resolveFileUrl } from '../../api/client'
import { getAvatarByName } from '../../constants/avatars'
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

// Which hero art an opponent's hero maps to: a bundled animated hero (shown as
// its STATIC first frame), else a catalogue portrait (by id, then by name),
// else the same-named character art, else nothing (caller falls back).
export function resolveRivalHero(hero, catalog = []) {
  if (!hero || (!hero.name && !hero.id)) return null
  const name = typeof hero.name === 'string' ? hero.name.trim() : ''
  const entry =
    catalog.find((h) => hero.id && h.id === hero.id) ||
    catalog.find(
      (h) => name && h.name?.trim().toLowerCase() === name.toLowerCase()
    )
  const label = entry?.name || name
  if (label && hasHero(label)) return { kind: 'sprite', name: label }
  const src =
    resolveFileUrl(entry?.portraitUrl) ||
    resolveFileUrl(hero.assetUrl) ||
    (label ? getAvatarByName(label)?.src : null)
  return src ? { kind: 'image', name: label, src } : null
}

// Shown when a rival's hero is not known (the server doesn't send it yet, or it
// is a hero this app has no art for): the default hero, never a bare letter.
export const DEFAULT_RIVAL_HERO = 'comet'

// The rival's equipped hero as a STATIC picture (first idle frame / portrait -
// never the animated sheet, and only this one hero is fetched), standing on the
// SAME stage frame as the player's own hero (YouFigure). A shimmer box stands in
// while it loads. A hero that is unknown or whose image breaks falls back to the
// default hero. `src` (the rival's photo) is only used by compact list rows
// (`photoFallback`) so a known photo isn't replaced by a made-up hero.
export function RivalHero({
  hero,
  catalog,
  name,
  src,
  size = 72,
  unknown = false,
  photoFallback = false,
  loading = false, // hero lookup still in flight: shimmer, no made-up hero yet
}) {
  const [state, setState] = useState('loading') // loading | ready | failed
  const markReady = useCallback(() => setState('ready'), [])
  if (unknown) {
    return <RivalFigure unknown size={size} />
  }
  if (loading && !hero) {
    return (
      <span
        className="pvp-hero-fig pvp-rival-hero is-loading"
        style={{ '--s': `${size * 1.35}px` }}
        role="img"
        aria-label="Loading rival hero"
      >
        <span className="pvp-hero-stage" />
      </span>
    )
  }
  const known = state === 'failed' ? null : resolveRivalHero(hero, catalog)
  if (!known && photoFallback && src) {
    return <RivalFigure name={name} src={src} size={size} />
  }
  const art = known || {
    kind: 'sprite',
    name: DEFAULT_RIVAL_HERO,
    isDefault: true,
  }
  if (!hasHero(art.name) && art.kind === 'sprite') {
    // Not even the default art is bundled (can't happen today): last resort.
    return <RivalFigure name={name} src={src} size={size} />
  }
  return (
    <span
      className={`pvp-hero-fig pvp-rival-hero${state === 'loading' ? ' is-loading' : ''}`}
      style={{ '--s': `${size * 1.35}px` }}
      data-hero={art.name || undefined}
      data-hero-default={art.isDefault ? 'true' : undefined}
      data-hero-color={hero?.color || undefined}
      role="img"
      aria-label={name ? `${name}'s hero` : 'Rival hero'}
    >
      <HeroStage hero={art.name} className="pvp-hero-stage">
        {(h) =>
          art.kind === 'sprite' ? (
            <>
              <HeroFigure hero={{ name: art.name }} locked height={h || size} />
              <HeroReady onReady={markReady} />
            </>
          ) : (
            <img
              className="pvp-rival-hero-img"
              src={art.src}
              alt=""
              loading="lazy"
              decoding="async"
              style={{ height: h || size }}
              onLoad={markReady}
              onError={() => setState('failed')}
            />
          )
        }
      </HeroStage>
    </span>
  )
}

// HeroFigure's first frame is a plain image fetch with no callback: treat the
// sprite as ready shortly after so the shimmer never sticks.
function HeroReady({ onReady }) {
  useEffect(() => {
    const t = setTimeout(onReady, 250)
    return () => clearTimeout(t)
  }, [onReady])
  return null
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

// The "VS" motif: a hex badge with the crossed-swords icon centred above "VS".
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

// Empty-state illustration: the same crossed swords as the PvP header / VS
// badge, solid brand blue, centred in a dotted circle with a soft oval shadow
// centred under it. Plain HTML + CSS (no viewBox/transform tricks) so nothing
// can clip, and the swords' crossing sits at the circle's centre.
export function ArenaEmptyArt() {
  return (
    <div className="pvp-empty-art" role="img" aria-label="An empty arena">
      <span className="pvp-empty-ring">
        <IconSwords />
      </span>
      <span className="pvp-empty-shadow" aria-hidden="true" />
    </div>
  )
}
