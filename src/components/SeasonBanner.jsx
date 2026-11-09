import { useState } from 'react'
import { useSeasonCountdown } from '../hooks/useSeasonCountdown'
import SeasonPrizeModal from './SeasonPrizeModal'
import seasonBannerWebp from '../assets/ui/banners/season_banner.webp'
import seasonBannerWebp2x from '../assets/ui/banners/season_banner@2x.webp'
import seasonBannerJpg from '../assets/ui/banners/season_banner.jpg'
import seasonBannerJpg2x from '../assets/ui/banners/season_banner@2x.jpg'
import './SeasonBanner.css'

// Always the Leaderboard carousel's first slide (see SponsorBannerCarousel,
// which renders this ahead of the partner slides and skips it entirely only
// if the season banner image itself fails to matter - it doesn't, this has
// no active/inactive state like a partner does, it's always shown). The
// source art (src/assets/ui/banners/season_banner*) is already a clean
// export with no baked-in date text - that text used to be hand-painted
// into the image per season, which meant a new export every rotation; this
// pill is a live DOM overlay instead, positioned in percentages of the
// image's own fixed aspect ratio (1983x793 native, ~2.5:1) so it tracks the
// art at any slide width without per-breakpoint tuning, and reads the real
// countdown instead of whatever date happened to be baked in at export
// time. See useSeasonCountdown for the fetch/tick/clock-skew handling.
export default function SeasonBanner() {
  const { season, text, ariaLabel, localEndLabel, ended } = useSeasonCountdown()
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="season-banner-card"
        aria-label={
          ariaLabel
            ? `Season prize details - ${ariaLabel}`
            : 'Season prize details'
        }
        onClick={() => setModalOpen(true)}
      >
        <picture>
          <source
            type="image/webp"
            srcSet={`${seasonBannerWebp} 1600w, ${seasonBannerWebp2x} 1983w`}
            sizes="(min-width: 1100px) 1100px, 100vw"
          />
          <img
            className="season-banner-image"
            src={seasonBannerJpg}
            srcSet={`${seasonBannerJpg} 1600w, ${seasonBannerJpg2x} 1983w`}
            sizes="(min-width: 1100px) 1100px, 100vw"
            alt="Run Conquest - Reclaiming the Crown"
            width={1983}
            height={793}
            loading="eager"
          />
        </picture>

        {text && (
          <span
            className={`season-banner-pill${ended ? ' season-banner-pill-ended' : ''}`}
            title={
              localEndLabel
                ? `Season ends ${localEndLabel} (your local time)`
                : undefined
            }
          >
            {text}
          </span>
        )}
      </button>

      {modalOpen && (
        <SeasonPrizeModal season={season} onClose={() => setModalOpen(false)} />
      )}
    </>
  )
}
