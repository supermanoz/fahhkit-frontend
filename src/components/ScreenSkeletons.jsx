/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { Skeleton } from '../game/ui/Misc'
import GameButton from '../game/ui/GameButton'
import ProfileAvatar from './ProfileAvatar'
import './ScreenSkeletons.css'

// Loading placeholders for the Me and Shop screens (Mail's live in
// MailStates.jsx). Built on the shared <Skeleton> block and laid out with the
// REAL screens' own classes (hero-roster, cs-card, game-menu-hero, ...), so a
// skeleton is the same size as the content it stands in for - nothing jumps
// when data arrives. The shimmer is the shared one (.g-skeleton) and stops
// under prefers-reduced-motion.

export function SkeletonLine({ width = '100%', height = 12, className = '' }) {
  return (
    <Skeleton width={width} height={height} className={`sk ${className}`} />
  )
}

export function SkeletonAvatar({ size = 40, className = '' }) {
  return (
    <Skeleton width={size} height={size} round className={`sk ${className}`} />
  )
}

export function SkeletonButton({ width = 110, height = 32, className = '' }) {
  return (
    <Skeleton
      width={width}
      height={height}
      className={`sk sk-button ${className}`}
    />
  )
}

// A bordered game panel holding skeleton content.
export function SkeletonCard({ children, className = '' }) {
  return <div className={`sk-card ${className}`}>{children}</div>
}

// icon | two text lines | time - the same row shape as the list screens.
export function SkeletonRow({ className = '' }) {
  return (
    <div className={`sk-row ${className}`}>
      <SkeletonAvatar size={40} />
      <span className="sk-row-lines">
        <SkeletonLine width="70%" />
        <SkeletonLine width="45%" height={10} />
      </span>
      <SkeletonLine width={34} height={10} />
    </div>
  )
}

export function SkeletonStat() {
  return (
    <div className="sk-stat">
      <SkeletonLine width="50%" height={22} />
      <SkeletonLine width="70%" height={10} />
    </div>
  )
}

// Shared "couldn't load" state: used when a request fails OR a skeleton has
// been showing past its timeout. Always offers Retry.
export function LoadFailed({ message, onRetry, testId = 'load-failed' }) {
  return (
    <div className="sk-failed" role="alert" data-testid={testId}>
      <p className="sk-failed-title">{message}</p>
      <p className="sk-failed-hint">Check your connection and try again.</p>
      {onRetry && (
        <GameButton variant="success" onClick={onRetry}>
          Retry
        </GameButton>
      )}
    </div>
  )
}

// ----- Me -------------------------------------------------------------------
// Hero stage, XP bar, avatar, name + level, area summary, stat tiles and the
// profile/settings rows - in the Me tab's own order and wrappers.
export function MeSkeleton() {
  return (
    <div
      className="me-skeleton"
      role="status"
      aria-live="polite"
      aria-label="Loading your profile"
      data-testid="me-skeleton"
    >
      <div className="game-menu-hero">
        <Skeleton
          width="100%"
          height={260}
          className="sk game-menu-hero-stage me-sk-hero"
        />
      </div>
      <div className="game-level-hud">
        <div className="game-hud-level-track">
          <Skeleton width="100%" height={28} className="sk" />
        </div>
      </div>
      <ProfileAvatar loading />
      <p className="game-menu-player-name me-sk-name">
        <SkeletonLine width={140} height={16} className="sk-center" />
      </p>
      <div className="game-menu-summary">
        <SkeletonLine width={110} height={30} className="sk-center" />
        <SkeletonLine width={70} height={12} className="sk-center sk-gap" />
      </div>
      <div className="game-cards">
        <div className="me-sk-stats">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonStat key={i} />
          ))}
        </div>
        <SkeletonCard>
          {[0, 1, 2].map((i) => (
            <SkeletonRow key={i} />
          ))}
        </SkeletonCard>
      </div>
    </div>
  )
}

// ----- Shop -----------------------------------------------------------------
// The balance number inside the wallet pill.
export function WalletSkeleton() {
  return (
    <span
      className="shop-sk-balance"
      role="status"
      aria-label="Loading balance"
      data-testid="wallet-skeleton"
    >
      <SkeletonLine width={72} height={24} />
    </span>
  )
}

// Hero gallery: arrows, stage, name, price/equip button, dots - the real
// .hero-roster sizes (380px stage).
export function HeroGallerySkeleton() {
  return (
    <div
      className="hero-roster shop-sk"
      role="status"
      aria-live="polite"
      aria-label="Loading heroes"
      data-testid="shop-skeleton"
    >
      <div className="hero-roster-row">
        <SkeletonAvatar size={34} />
        <div className="hero-roster-stage">
          <div className="shop-sk-hero">
            <Skeleton width="100%" height="100%" className="sk shop-sk-stage" />
            <SkeletonLine width={150} height={22} className="sk-center" />
            <Skeleton
              width="min(220px, 100%)"
              height={44}
              className="sk sk-button sk-center"
            />
          </div>
        </div>
        <SkeletonAvatar size={34} />
      </div>
      <div className="hero-roster-dots">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonAvatar key={i} size={8} />
        ))}
      </div>
    </div>
  )
}

// Territory / Trail (and any other item grid): .cs-card with the preview
// window, name and price pill.
export function ColorShelfSkeleton({ count = 6 }) {
  return (
    <section
      className="cs-shelf shop-sk"
      role="status"
      aria-live="polite"
      aria-label="Loading shop items"
      data-testid="shop-skeleton"
    >
      <div className="cs-grid">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="cs-card shop-sk-card">
            <span className="cs-frame">
              <span className="cs-window">
                <Skeleton width="100%" height="100%" className="sk" />
              </span>
            </span>
            <span className="cs-name">
              <SkeletonLine width="60%" height={16} className="sk-center" />
            </span>
            <span className="cs-foot">
              <SkeletonButton width={84} height={32} />
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

export function ShopSkeleton({ section = 'heroes' }) {
  return section === 'heroes' ? <HeroGallerySkeleton /> : <ColorShelfSkeleton />
}
