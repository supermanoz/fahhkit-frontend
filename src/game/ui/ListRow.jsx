import './components.css'

// eslint-disable-next-line react/prop-types -- no prop-types dependency in this project
export function ListRow({
  variant = 'navy',
  selected = false,
  chevron = false,
  onClick,
  children,
  className = '',
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`g-row g-row-${variant} ${selected ? 'g-row-selected' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
      {chevron && (
        <span className="g-row-chevron" aria-hidden="true">
          ›
        </span>
      )}
    </Tag>
  )
}

// eslint-disable-next-line react/prop-types -- no prop-types dependency in this project
export function Card({ variant = 'navy', children, className = '' }) {
  return (
    <div className={`g-card g-card-${variant} ${className}`}>{children}</div>
  )
}
