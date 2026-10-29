import { useState } from 'react'
import './components.css'

// eslint-disable-next-line react/prop-types -- no prop-types dependency in this project
export default function Avatar({
  src,
  name = '',
  size = 48,
  ring,
  level,
  className = '',
}) {
  const [errored, setErrored] = useState(false)
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  const style = { width: size, height: size, '--ring-color': ring }

  return (
    <span
      className={`g-avatar ${ring ? 'g-avatar-ring' : ''} ${className}`}
      style={style}
    >
      {src && !errored ? (
        <img
          className="g-avatar-img"
          src={src}
          alt={name}
          onError={() => setErrored(true)}
        />
      ) : (
        <span className="g-avatar-fallback">{initial}</span>
      )}
      {level != null && (
        <span className="g-avatar-level">
          <span className="g-badge g-badge-level">{level}</span>
        </span>
      )}
    </span>
  )
}
