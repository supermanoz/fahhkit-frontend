/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect } from 'react'
import { IconClose } from '../GameIcons'
import GameLegalDocument from './GameLegalDocument'
import './GameLegal.css'

// The terms/privacy document in an overlay inside the game (sign-up screen,
// Settings) - never the website page. Esc / backdrop click / the red close
// button all close it.
export default function GameLegalModal({ doc, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div
      className="game-legal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={doc === 'privacy' ? 'Privacy Policy' : 'Terms & Conditions'}
      onClick={onClose}
    >
      <div className="game-legal-panel" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="game-close-btn game-legal-close"
          onClick={onClose}
          aria-label="Close"
        >
          <IconClose />
        </button>
        <div className="game-legal-scroll">
          <GameLegalDocument doc={doc} idPrefix="gl-modal" />
        </div>
      </div>
    </div>
  )
}
