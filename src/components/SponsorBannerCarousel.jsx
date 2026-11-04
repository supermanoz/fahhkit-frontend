import { useCallback, useEffect, useRef, useState } from 'react'
import { resolveFileUrl } from '../api/client'
import { getCurrentSeasonPartners } from '../api/sponsorPartners'
import { openExternal } from '../utils/externalLink'
import './SponsorBannerCarousel.css'

const ROTATE_MS = 5000

// Rotating sponsor banner shown above the game Leaderboard - admin-managed
// (see SponsorBannerAdminPanel.jsx), reading the current season's Partner
// rows via GET /v1/partner/current. A full-bleed ad card now (cover-fit
// image, dark bottom scrim, a "View" pill, an "Ad" tag) - was a small
// centred logo floating in an oversized box before. Still just one real
// image per partner (imageUrl) and no click-tracking endpoint on this
// entity at all (checked the backend directly - PartnerController has
// nothing past create/update/extend) - "calls the click endpoint" from the
// brief this was built against isn't something to fake here; tapping the
// card still opens the partner's real link, just without a tracked hit.
//
// One full-width card at a time: native scroll-snap for swipe (same
// mechanism as ClubWarHeroPicker, including its debounced handleScroll - a
// timer-driven goTo() mid-scroll would otherwise fight a manual swipe's own
// scroll events the same way arrows once fought ClubWarHeroPicker's), a
// timer auto-advancing every ROTATE_MS, and dots overlaid on the viewport
// (not per-slide - a fixed position above whichever card is currently
// scrolled into view, not duplicated once per partner). Renders nothing at
// all (no gap) with zero active partners - the early return below, not a
// CSS display:none, so the leaderboard card above it doesn't leave a blank
// strip.
export default function SponsorBannerCarousel() {
  const [partners, setPartners] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [index, setIndex] = useState(0)
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
        // Promotional, not critical - fails into the same "render nothing"
        // state as genuinely having no active partners, no error banner.
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const goTo = useCallback(
    (i) => {
      if (partners.length === 0) return
      setIndex(((i % partners.length) + partners.length) % partners.length)
    },
    [partners.length]
  )

  const restartTimer = useCallback(() => {
    clearInterval(timerRef.current)
    if (partners.length <= 1) return
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % partners.length)
    }, ROTATE_MS)
  }, [partners.length])

  useEffect(() => {
    restartTimer()
    return () => clearInterval(timerRef.current)
  }, [restartTimer])

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

  if (!loaded || partners.length === 0) return null

  return (
    <div className="sponsor-banner-carousel">
      <div className="sponsor-banner-viewport">
        <ul
          className="sponsor-banner-track"
          ref={trackRef}
          onScroll={handleScroll}
          onPointerDown={() => clearInterval(timerRef.current)}
          onPointerUp={restartTimer}
          aria-label="Sponsor banners"
        >
          {partners.map((p) => {
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
            // The whole card is the tap target (not just the "View" pill,
            // which is decorative only - a real <button> nested inside
            // this <a> would be invalid HTML, and there's nothing it would
            // do differently from the card itself anyway) - a partner with
            // no redirect link just renders a plain, non-interactive card.
            return (
              <li className="sponsor-banner-slide" key={p.id}>
                {p.socialLink1 ? (
                  <a
                    className="sponsor-banner-card"
                    href={p.socialLink1}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`View ${p.name}`}
                    onClick={(e) => openExternal(p.socialLink1, e)}
                  >
                    {image}
                    <span className="sponsor-banner-scrim" aria-hidden="true" />
                    <span className="sponsor-banner-ad-tag" aria-hidden="true">
                      Ad
                    </span>
                    <span
                      className="sponsor-banner-view-btn"
                      aria-hidden="true"
                    >
                      View
                    </span>
                  </a>
                ) : (
                  <div className="sponsor-banner-card">
                    {image}
                    <span className="sponsor-banner-ad-tag" aria-hidden="true">
                      Ad
                    </span>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {partners.length > 1 && (
          <div className="sponsor-banner-dots">
            {partners.map((p, i) => (
              <button
                key={p.id}
                type="button"
                className={`sponsor-banner-dot ${i === index ? 'active' : ''}`}
                aria-label={`Show ${p.name}`}
                onClick={() => {
                  goTo(i)
                  restartTimer()
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
