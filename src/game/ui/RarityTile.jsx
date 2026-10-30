/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import './components.css'

export default function RarityTile({
  rarity = 'common',
  icon,
  locked = false,
  equipped = false,
  isNew = false,
  onClick,
  className = '',
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`g-rarity-tile g-rarity-${rarity} ${className}`}
      onClick={onClick}
    >
      {icon}
      {locked && (
        <span className="g-rarity-lock" aria-hidden="true">
          🔒
        </span>
      )}
      {equipped && (
        <span className="g-rarity-equipped" aria-label="Equipped">
          ✓
        </span>
      )}
      {isNew && (
        <span className="g-rarity-new">
          <span className="g-badge g-badge-new">NEW</span>
        </span>
      )}
    </Tag>
  )
}
