/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconClose } from '../components/GameIcons'
import GameLegalDocument from '../components/game-legal/GameLegalDocument'
import { GAME_LEGAL_DOCS } from '../constants/gameLegal'
import '../game/styles/tokens.css'
import '../components/GameCards.css'
import '../components/game-legal/GameLegal.css'

// Public, login-free pages the app stores can link to:
//   /game/terms  and  /game/privacy
// (web build and native app both route them - see App.jsx / WebShell.jsx).
export default function GameLegalPage({ doc }) {
  const navigate = useNavigate()
  useEffect(() => {
    document.title = `Run Conquest - ${GAME_LEGAL_DOCS[doc].title}`
  }, [doc])
  const close = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/game', { replace: true })
  }
  return (
    <div className="game-root game-legal-page">
      <div className="game-legal-panel is-page">
        <button
          type="button"
          className="game-close-btn game-legal-close"
          onClick={close}
          aria-label="Close"
        >
          <IconClose />
        </button>
        <div className="game-legal-scroll">
          <GameLegalDocument doc={doc} idPrefix="gl-page" />
        </div>
      </div>
    </div>
  )
}
