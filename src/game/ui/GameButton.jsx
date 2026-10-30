/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import './components.css'
import { useGameSound } from './useGameSound'

// primary = sky (brand/default action), success = green (go/confirm only,
// e.g. "Yes, End"), premium = violet, danger = red, secondary = a frost
// card (not a gradient), ghost = transparent with sky text.
const VARIANT_CLASS = {
  primary: 'gb-primary',
  success: 'gb-success',
  secondary: 'gb-secondary',
  danger: 'gb-danger',
  premium: 'gb-premium',
  ghost: 'gb-ghost',
}

const SIZE_CLASS = { sm: 'gb-sm', md: '', lg: 'gb-lg' }

export default function GameButton({
  variant = 'primary',
  size = 'md',
  icon = null,
  loading = false,
  disabled = false,
  type = 'button',
  className = '',
  onClick,
  children,
  ...rest
}) {
  const { playTap } = useGameSound()

  function handleClick(e) {
    if (disabled || loading) return
    playTap()
    onClick?.(e)
  }

  return (
    <button
      type={type}
      className={`gb ${VARIANT_CLASS[variant] || VARIANT_CLASS.primary} ${SIZE_CLASS[size] || ''} ${loading ? 'gb-loading' : ''} ${className}`}
      disabled={disabled || loading}
      onClick={handleClick}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="gb-spinner" aria-hidden="true" />}
      {icon && !loading && (
        <span className="gb-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className={loading ? 'gb-label-hidden' : ''}>{children}</span>
    </button>
  )
}
