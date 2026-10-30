/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef } from 'react'
import './components.css'

export function Panel({ className = '', children, ...rest }) {
  return (
    <div className={`g-panel ${className}`} {...rest}>
      {children}
    </div>
  )
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({
  title,
  onClose,
  premium = false,
  children,
  className = '',
}) {
  const dialogRef = useRef(null)

  // Esc closes, and a basic focus trap (cycles Tab/Shift+Tab within the
  // dialog) - both required for any modal, not just this one. Focus moves
  // into the dialog on mount and back to whatever opened it isn't handled
  // here (the opener's own onClose callback is better placed to know what
  // to refocus), but Tab never escapes to the page behind the scrim.
  useEffect(() => {
    const dialog = dialogRef.current
    const focusables = () =>
      Array.from(dialog?.querySelectorAll(FOCUSABLE) || [])
    focusables()[0]?.focus()

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        onClose?.()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="g-modal-scrim" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className={`g-panel g-modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        {onClose && (
          <button
            type="button"
            className="g-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        )}
        {title && (
          <div
            className={`g-modal-ribbon ${premium ? 'g-modal-ribbon-premium' : ''}`}
          >
            {title}
          </div>
        )}
        <div className="g-modal-body">{children}</div>
      </div>
    </div>
  )
}
