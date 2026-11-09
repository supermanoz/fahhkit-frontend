/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef } from 'react'
import { IconClose } from './GameIcons'
import { getPrizeInfo } from '../config/prizeInfo'
import './PrizeInfoPopup.css'

// "How prizes work" - opened from the small "i" button on every Leaderboard
// banner slide (see SponsorBannerCarousel.jsx's infoSlide). partner is null
// for the season slide, or the partner object for a sponsor slide - either
// way the copy comes from config/prizeInfo.js, not hardcoded here.
export default function PrizeInfoPopup({ partner, onClose }) {
  const closeBtnRef = useRef(null)
  const { title, points, footer } = getPrizeInfo(partner)

  // The close button is the only focusable thing in here, so trapping
  // focus just means keeping it there - Esc also closes, same as tapping
  // the overlay.
  useEffect(() => {
    closeBtnRef.current?.focus()
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        closeBtnRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="prize-info-overlay" onClick={onClose}>
      <div
        className="prize-info-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeBtnRef}
          type="button"
          className="game-close-btn prize-info-close"
          aria-label="Close"
          onClick={onClose}
        >
          <IconClose />
        </button>

        <h2 className="prize-info-title">{title}</h2>

        <ol className="prize-info-list">
          {points.map((text, i) => (
            <li key={i} className="prize-info-item">
              <span className="prize-info-badge" aria-hidden="true">
                {i + 1}
              </span>
              <span className="prize-info-text">{text}</span>
            </li>
          ))}
        </ol>

        <p className="prize-info-footer">{footer}</p>
      </div>
    </div>
  )
}
