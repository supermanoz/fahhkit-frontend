/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import './components.css'

const KIND_CLASS = {
  count: 'g-badge-count',
  level: 'g-badge-level',
  new: 'g-badge-new',
}

export default function Badge({ kind = 'count', children, className = '' }) {
  return (
    <span
      className={`g-badge ${KIND_CLASS[kind] || KIND_CLASS.count} ${className}`}
    >
      {children}
    </span>
  )
}
