/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import {
  GAME_LEGAL_DOCS,
  GAME_LEGAL_LAST_UPDATED,
  GAME_OPERATOR,
} from '../../constants/gameLegal'
import './GameLegal.css'

// [CHECK ...] and [CONTACT EMAIL] placeholders are highlighted so they are
// impossible to miss before launch.
function Text({ children }) {
  const parts = String(children).split(/(\[CHECK[^\]]*\]|\[CONTACT EMAIL\])/)
  return parts.map((p, i) =>
    /^\[(CHECK|CONTACT)/.test(p) ? (
      <mark key={i} className="game-legal-check">
        {p}
      </mark>
    ) : (
      p
    )
  )
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
