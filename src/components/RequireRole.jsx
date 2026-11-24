/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { Navigate, useLocation } from 'react-router-dom'
import { canManageEvents, isAdmin } from '../api/client'
import { useVerifiedUser } from '../hooks/useCurrentUser'
import './RequireRole.css'

// Role guard for the website's staff pages (WebShell.jsx), used INSIDE
// RequireAuth. It renders the page only once the SERVER has confirmed the
// signed-in user's role (GET /v1/user/find/logged-in) - never from the copy of
// the user kept in localStorage, which anyone can edit. Because the page is
// not rendered until then, its lazy chunk is not even downloaded for someone
// who is not allowed in.
//   allow="admin"  ADMIN only
//   allow="staff"  ADMIN or MODERATOR
// Not allowed -> back to the home page with a friendly notice
// (AccessDeniedNotice). Server unreachable -> fails closed with a Retry.
// This is a UX layer only: every admin API is also role-checked server-side.
const CHECKS = { admin: isAdmin, staff: canManageEvents }

export default function RequireRole({ allow, children }) {
  const { status, user, retry } = useVerifiedUser()
  const location = useLocation()
  const permitted = (CHECKS[allow] || (() => false))(user)

  if (status === 'loading') {
    return (
      <div className="require-role-wait" role="status" aria-live="polite">
        Checking access…
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="require-role-wait" role="alert">
        <p>We couldn&apos;t verify your access. Check your connection.</p>
        <button type="button" className="require-role-retry" onClick={retry}>
          Try again
        </button>
      </div>
    )
  }
  if (status === 'ready' && permitted) return children
  // 'anon' (RequireAuth is about to redirect to login) or not allowed.
  if (status === 'anon') return null
  return (
    <Navigate
      to="/"
      replace
      state={{ accessDenied: true, deniedPath: location.pathname }}
    />
  )
}
