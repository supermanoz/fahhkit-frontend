/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { createElement } from 'react'
import { useGameSound } from '../../game/ui/useGameSound'
import './GameButton.css'

// THE game button. One recipe for every button in the game (the Leaderboard
// "Top Players" look: glossy gradient, light top highlight, thick ink outline,
// chunky bottom edge, white outlined display-font label). Colour = `variant`:
//   primary (green) | accent (slate, the Leaderboard's) | gold | danger (red)
//   neutral (cream, dark label) | tab (segmented toggle)
// `size` sm | md | lg, `fullWidth`, `icon` (left), `iconOnly` (round, needs
// aria-label), `loading` (spinner, label kept so the width never changes),
// `selected` (tab filled), `as`/`href` (renders a link). Visual only - it adds
// no behaviour of its own except the optional tap `sound` (off by default).
const VARIANTS = ['primary', 'accent', 'gold', 'danger', 'neutral', 'tab']

export default function GameButton({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  icon = null,
  iconOnly = false,
  loading = false,
  disabled = false,
  selected = false,
  as,
  href,
  type,
  sound = false,
  className = '',
  onClick,
  children,
  ...rest
}) {
  const { playTap } = useGameSound()
  const v = VARIANTS.includes(variant) ? variant : 'primary'
  const off = disabled || loading
  const tag = as || (href ? 'a' : 'button')

  const classes = [
    'gbtn',
    `gbtn-${v}`,
    `gbtn-${size}`,
    fullWidth && 'gbtn-full',
    iconOnly && 'gbtn-icon-only',
    selected && 'is-selected',
    loading && 'is-loading',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  function handleClick(e) {
    if (off) {
      e.preventDefault()
      return
    }
    if (sound) playTap()
    onClick?.(e)
  }

  const props = {
    className: classes,
    onClick: handleClick,
    'aria-busy': loading || undefined,
    ...rest,
  }
  if (tag === 'button') {
    props.type = type || 'button'
    props.disabled = off
  } else {
    props.href = href
    props['aria-disabled'] = off || undefined
    if (off) props.tabIndex = -1
  }
  if (v === 'tab') {
    props.role = rest.role || 'tab'
    props['aria-selected'] = selected
  }

  return createElement(
    tag,
    props,
    loading && <span className="gbtn-spinner" aria-hidden="true" />,
    icon && (
      <span className="gbtn-icon" aria-hidden="true">
        {icon}
      </span>
    ),
    children != null && children !== false && (
      <span className="gbtn-label">{children}</span>
    )
  )
}
