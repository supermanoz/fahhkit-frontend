import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './AccessDeniedNotice.css'

// The friendly message shown after RequireRole bounces someone off a staff
// page: it arrives as navigation state ({accessDenied: true}) on the page they
// were sent to, shows for a few seconds, then clears itself so a refresh or a
// back-navigation does not show it again.
export default function AccessDeniedNotice() {
  const location = useLocation()
  const navigate = useNavigate()
  const denied = Boolean(location.state?.accessDenied)

  function dismiss() {
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: null,
    })
  }

  useEffect(() => {
    if (!denied) return undefined
    const id = setTimeout(dismiss, 7000)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dismiss only reads the current location
  }, [denied, location.key])

  if (!denied) return null
  return (
    <div className="access-denied-notice" role="status" aria-live="polite">
      <span>You don&apos;t have access to that page.</span>
      <button type="button" onClick={dismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}
