/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resolveFileUrl } from '../api/client'
import { getCurrentSeasonPartners } from '../api/sponsorPartners'
import { openExternal } from '../utils/externalLink'
import SeasonBanner from './SeasonBanner'
import PrizeInfoPopup from './PrizeInfoPopup'
import './SponsorBannerCarousel.css'

const ROTATE_MS = 5000

// Easy to reword without hunting through the JSX/CSS below.
const SEASON_PARTNER_LABEL = 'Season Partner'

// Small filled star, not the game's usual stroke-only GameIcon style -
// at 12px on a solid pill a thin outline star just reads as a smudge, a
// filled shape stays crisp that small.
function SeasonPartnerStar() {
  return (
    <svg
      className="sponsor-banner-partner-tag-icon"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2.5l2.76 6.19 6.74.62-5.1 4.49 1.53 6.6L12 16.9l-5.93 3.5 1.53-6.6-5.1-4.49 6.74-.62z" />
    </svg>
  )
}

// Small round "i" - opens PrizeInfoPopup for whichever slide it sits on
// (see SponsorBannerCarousel's infoSlide). A sibling of the slide's own
// card/button, not nested inside it - .season-banner-card and the partner
// card's <a> are both already interactive, and a <button> nested inside
// either would be invalid HTML (and unpredictable in real browsers).
// stopPropagation keeps the tap from also firing the card's own
// link/click or the carousel's drag handling underneath it.
function PrizeInfoButton({ onOpen }) {
  return (
    <button
      type="button"
      className="sponsor-banner-info-btn"
      aria-label="How prizes work"
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
      // The track's own onPointerDown/onPointerUp (pause/resume rotation
      // while dragging) listen on the <ul>, which these would otherwise
      // still bubble up to even though the click above is stopped - left
      // alone, tapping "i" would un-pause the carousel a beat after
      // opening the popup.
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <span className="sponsor-banner-info-btn-glyph" aria-hidden="true">
        i
      </span>
    </button>
  )
}

// One partner slide - image, "View" link, and (every partner slide, since
// they all come from the season-partners endpoint) the small corner tag
// marking it as a season partner rather than the game's own banner. Takes
// isSeasonPartner as an explicit prop rather than assuming it from
// context, so the tag stays correct if a non-season partner type (or a
// placeholder slide) is ever added alongside these.
function PartnerBannerSlide({ partner: p, isSeasonPartner }) {
  const image = (
    <img
      className="sponsor-banner-image"
      src={resolveFileUrl(p.imageUrl)}
      alt={p.name}
      width={1600}
      height={500}
      loading="lazy"
    />
  )
  const tag = isSeasonPartner && (
    <span className="sponsor-banner-partner-tag" aria-label="Season partner">
      <SeasonPartnerStar />
      {SEASON_PARTNER_LABEL}
    </span>
  )
  // The whole card is the tap target (not just the "View" pill, which is
  // decorative only - a real <button> nested inside this <a> would be
  // invalid HTML, and there's nothing it would do differently from the
  // card itself anyway) - a partner with no redirect link just renders a
  // plain, non-interactive card.
  return p.socialLink1 ? (
    <a
      className="sponsor-banner-card"
      href={p.socialLink1}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Sponsor: ${p.name}`}
      onClick={(e) => openExternal(p.socialLink1, e)}
    >
      {image}
      <span className="sponsor-banner-scrim" aria-hidden="true" />
      {tag}
      <span className="sponsor-banner-view-btn" aria-hidden="true">
        View
      </span>
    </a>
  ) : (
    <div
      className="sponsor-banner-card"
      role="group"
      aria-label={`Sponsor: ${p.name}`}
    >
      {image}
      {tag}
    </div>
  )
}

// Leaderboard banner carousel - the season banner (see SeasonBanner.jsx)
// always first, then admin-managed sponsor Partner rows (see
// SponsorBannerAdminPanel.jsx) read via GET /v1/partner/current. A
// full-bleed ad card for each partner (cover-fit image, dark bottom scrim,
// a "View" pill) - was a small centred logo floating in an oversized box
// before. Still just one real image per partner (imageUrl) and no
// click-tracking endpoint on this entity at all (checked the backend
// directly - PartnerController has nothing past create/update/extend) -
// "calls the click endpoint" from the brief this was built against isn't
// something to fake here; tapping the card still opens the partner's real
// link, just without a tracked hit.
//
// One full-width card at a time: native scroll-snap for swipe (same
// mechanism as ClubWarHeroPicker, including its debounced handleScroll - a
// timer-driven goTo() mid-scroll would otherwise fight a manual swipe's own
// scroll events the same way arrows once fought ClubWarHeroPicker's), a
// timer auto-advancing every ROTATE_MS, and dots overlaid on the viewport
// (not per-slide - a fixed position above whichever card is currently
// scrolled into view, not duplicated once per partner). The season slide
// always renders - unlike partners, it has no active/inactive or
// loading-gated state - so this never renders nothing; dots only appear
// once there's more than one slide (season + at least one partner).
export default function SponsorBannerCarousel() {
  const [partners, setPartners] = useState([])
  const [index, setIndex] = useState(0)
  // null | { type: 'season' } | { type: 'partner', partner } - which
  // slide's "i" was tapped, if any. Lives here (not per-slide) since
  // pausing auto-rotation while it's open is this component's job either
  // way, and there's only ever one popup open at a time.
  const [infoSlide, setInfoSlide] = useState(null)
  const trackRef = useRef(null)
  const timerRef = useRef(null)
  const scrollTimeoutRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    getCurrentSeasonPartners()
      .then((data) => {
        if (!cancelled) setPartners((data || []).filter((p) => p.active))
      })
      .catch(() => {
        // Promotional, not critical - fails into "season slide alone",
        // same as genuinely having no active partners, no error banner.
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Season slide first, always - partner slides follow once loaded.
  const slides = useMemo(
    () => [
      { key: 'season', type: 'season' },
      ...partners.map((p) => ({ key: p.id, type: 'partner', partner: p })),
    ],
    [partners]
  )

  const goTo = useCallback(
    (i) => {
      setIndex(((i % slides.length) + slides.length) % slides.length)
    },
    [slides.length]
  )

  const restartTimer = useCallback(() => {
    clearInterval(timerRef.current)
    if (slides.length <= 1) return
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length)
    }, ROTATE_MS)
  }, [slides.length])

  useEffect(() => {
    restartTimer()
    return () => clearInterval(timerRef.current)
  }, [restartTimer])

  // Pauses auto-rotation for as long as the prize-info popup is open,
  // resuming (from a fresh ROTATE_MS, same as a manual swipe/dot tap
  // would) once it closes.
  useEffect(() => {
    if (infoSlide) {
      clearInterval(timerRef.current)
    } else {
      restartTimer()
    }
  }, [infoSlide, restartTimer])

  // Scrolls the track to match `index` on every programmatic change (timer
  // tick or dot tap).
  useEffect(() => {
    const card = trackRef.current?.children[index]
    card?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  }, [index])

  useEffect(() => {
    return () => clearTimeout(scrollTimeoutRef.current)
  }, [])

  // Debounced, not computed on every scroll tick - see ClubWarHeroPicker's
  // own handleScroll comment for why: reading "closest card" mid-flight
  // (while the scrollIntoView above is still animating there) keeps finding
  // the old one and snapping index straight back.
  function handleScroll() {
    clearTimeout(scrollTimeoutRef.current)
    scrollTimeoutRef.current = setTimeout(() => {
      const track = trackRef.current
      if (!track) return
      const center = track.getBoundingClientRect().left + track.clientWidth / 2
      let closest = 0
      let closestDist = Infinity
      Array.from(track.children).forEach((child, i) => {
        const rect = child.getBoundingClientRect()
        const dist = Math.abs(rect.left + rect.width / 2 - center)
        if (dist < closestDist) {
          closestDist = dist
          closest = i
        }
      })
      setIndex(closest)
    }, 120)
  }

  return (
    <div className="sponsor-banner-carousel">
      <div className="sponsor-banner-viewport">
        <ul
          className="sponsor-banner-track"
          ref={trackRef}
          onScroll={handleScroll}
          onPointerDown={() => clearInterval(timerRef.current)}
          onPointerUp={restartTimer}
          aria-label="Leaderboard banners"
        >
          {slides.map((slide) => {
            if (slide.type === 'season') {
              return (
                <li className="sponsor-banner-slide" key={slide.key}>
                  <SeasonBanner />
                  <PrizeInfoButton
                    onOpen={() => setInfoSlide({ type: 'season' })}
                  />
                </li>
              )
            }

            return (
              <li className="sponsor-banner-slide" key={slide.key}>
                <PartnerBannerSlide partner={slide.partner} isSeasonPartner />
                <PrizeInfoButton
                  onOpen={() =>
                    setInfoSlide({ type: 'partner', partner: slide.partner })
                  }
                />
              </li>
            )
          })}
        </ul>

        {slides.length > 1 && (
          <div className="sponsor-banner-dots">
            {slides.map((slide, i) => (
              <button
                key={slide.key}
                type="button"
                className={`sponsor-banner-dot ${i === index ? 'active' : ''}`}
                aria-label={
                  slide.type === 'season'
                    ? 'Show season banner'
                    : `Show ${slide.partner.name}`
                }
                onClick={() => {
                  goTo(i)
                  restartTimer()
                }}
              />
            ))}
          </div>
        )}
      </div>

      {infoSlide && (
        <PrizeInfoPopup
          partner={infoSlide.type === 'partner' ? infoSlide.partner : null}
          onClose={() => setInfoSlide(null)}
        />
      )}
    </div>
  )
}
