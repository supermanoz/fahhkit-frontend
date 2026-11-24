/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import {
  GAME_CONTACT_EMAIL,
  GAME_LEGAL_DOCS,
  GAME_LEGAL_LAST_UPDATED,
  GAME_OPERATOR,
} from '../../constants/gameLegal'
import { openMailto } from '../../utils/externalLink'
import './GameLegal.css'

// The contact address becomes a mailto: link (opened through the system in
// the native app, never inside the WebView).
const ESCAPED_EMAIL = GAME_CONTACT_EMAIL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const TEXT_SPLIT = new RegExp(`(${ESCAPED_EMAIL})`)
function Text({ children }) {
  const parts = String(children).split(TEXT_SPLIT)
  return parts.map((p, i) => {
    if (p === GAME_CONTACT_EMAIL) {
      return (
        <a
          key={i}
          className="game-legal-mail"
          href={`mailto:${GAME_CONTACT_EMAIL}`}
          onClick={(e) => openMailto(GAME_CONTACT_EMAIL, e)}
        >
          {GAME_CONTACT_EMAIL}
        </a>
      )
    }
    return p
  })
}

// One document (terms | privacy): title, last-updated date, short table of
// contents (in-page anchors) and the sections. `idPrefix` keeps anchors
// unique when it renders inside the modal on top of other content.
export default function GameLegalDocument({ doc, idPrefix = 'gl' }) {
  const d = GAME_LEGAL_DOCS[doc]
  if (!d) return null
  const anchor = (id) => `${idPrefix}-${doc}-${id}`
  const jump = (e, id) => {
    e.preventDefault()
    document
      .getElementById(anchor(id))
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return (
    <article className="game-legal-doc">
      <h1 className="game-legal-title">{d.title}</h1>
      <p className="game-legal-meta">
        Run Conquest · {GAME_OPERATOR} · Last updated {GAME_LEGAL_LAST_UPDATED}
      </p>
      <p className="game-legal-intro">
        <Text>{d.intro}</Text>
      </p>

      <nav className="game-legal-toc" aria-label="Contents">
        <h2 className="game-legal-toc-title">Contents</h2>
        <ol>
          {d.sections.map((s) => (
            <li key={s.id}>
              <a href={`#${anchor(s.id)}`} onClick={(e) => jump(e, s.id)}>
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {d.sections.map((s, n) => (
        <section key={s.id} id={anchor(s.id)} className="game-legal-section">
          <h2>
            {n + 1}. {s.title}
          </h2>
          {s.paras?.map((p, i) => (
            <p key={i}>
              <Text>{p}</Text>
            </p>
          ))}
          {s.list && (
            <ul>
              {s.list.map((li, i) => (
                <li key={i}>
                  <Text>{li}</Text>
                </li>
              ))}
            </ul>
          )}
          {s.after && (
            <p>
              <Text>{s.after}</Text>
            </p>
          )}
        </section>
      ))}
    </article>
  )
}
