/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import './arena.css'

// The big screen title: a centred ribbon with notched ends, display font. The
// colours come from --ribbon-from / --ribbon-to (a tone class sets them), so
// any screen can theme it - the PvP arena uses the electric blue.
export default function TitleRibbon({
  children,
  tone = 'blue',
  as: Tag = 'h2',
  className = '',
}) {
  return (
    <Tag className={`g-title-ribbon is-${tone} ${className}`}>
      <span className="g-title-ribbon-text">{children}</span>
    </Tag>
  )
}
