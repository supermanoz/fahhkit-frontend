/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useSyncExternalStore } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { clearSession, getToken, subscribeAuth } from '../api/client'
import { isTokenUsable, tokenExpiryMs } from '../utils/jwtExpiry'
import { buildLoginPath } from '../utils/safeNext'

// Route guard for the website's account-only pages (WebShell.jsx). Without a
// usable session - no token, an expired one, or one the server rejected
// (api/client.js clears it on a 401/403) - it sends the visitor to the
// website's sign-in page with ?next=<this page + query>, and LoginPage
// brings them back after signing in.
//
// It re-checks whenever the session changes (sign-out here or in another
// tab, a rejected token) and when the token's own expiry time passes, so an
// open page never sits blank or loading on a dead session. Website only:
// the native app build never mounts WebShell, so none of this runs in the
// app (where the player is already signed in).
export default function RequireAuth({ children }) {
  const token = useSyncExternalStore(subscribeAuth, getToken, () => null)
  const location = useLocation()
  const usable = isTokenUsable(token)

  // Token present but expired: drop it so the rest of the site (navbar...)
  // stops treating the visitor as signed in.
  useEffect(() => {
    if (token && !usable) clearSession()
  }, [token, usable])

  // Redirect at the moment a still-valid token expires.
  useEffect(() => {
    if (!token || !usable) return undefined
    const exp = tokenExpiryMs(token)
    if (exp == null) return undefined
    // setTimeout caps at ~24.8 days; re-arm for anything longer.
    const id = setTimeout(
      () => {
        if (!isTokenUsable(getToken())) clearSession()
      },
      Math.min(Math.max(exp - Date.now(), 0) + 50, 2 ** 31 - 1)
    )
    return () => clearTimeout(id)
  }, [token, usable])

  if (!usable) {
    return (
      <Navigate
        to={buildLoginPath(
          `${location.pathname}${location.search}${location.hash}`
        )}
        replace
      />
    )
  }
  return children
}
