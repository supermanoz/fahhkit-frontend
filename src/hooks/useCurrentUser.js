import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  getJson,
  getToken,
  getUser,
  setUser,
  subscribeAuth,
} from '../api/client'

// Every page renders <Navbar>, which calls this hook independently of
// whatever the page itself calls it for (e.g. LandingPage) — without dedup,
// mounting both at once fires the same GET twice, and React StrictMode's
// dev-only double-invoke of effects doubles that again (4 requests for one
// page load). Sharing the in-flight promise collapses all of that into one.
let inFlightFetch = null

function fetchCurrentUser() {
  if (!inFlightFetch) {
    inFlightFetch = getJson('/v1/user/find/logged-in')
      .then((data) => {
        setUser(data)
        return data
      })
      .finally(() => {
        inFlightFetch = null
      })
  }
  return inFlightFetch
}

// Role decisions (Admin menu, admin routes) must never come from the copy of
// the user kept in localStorage - anyone can edit that in dev tools. This
// hook only ever reports what the SERVER said in this page load:
//   status 'anon'    no session
//         'loading'  waiting for GET /v1/user/find/logged-in
//         'ready'    `user` is the server's answer (role = user.userType)
//         'error'    the server could not be asked (offline, 5xx): `user`
//                    stays null, so callers fail CLOSED (no admin UI).
// The real enforcement is server-side (SecurityConfig); this only decides what
// the UI shows.
export function useVerifiedUser() {
  const token = useSyncExternalStore(subscribeAuth, getToken, () => null)
  const isAuthed = Boolean(token)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({
    status: isAuthed ? 'loading' : 'anon',
    user: null,
  })

  useEffect(() => {
    if (!isAuthed) {
      setState({ status: 'anon', user: null })
      return undefined
    }
    let cancelled = false
    setState((s) =>
      s.status === 'ready' ? s : { status: 'loading', user: null }
    )
    fetchCurrentUser()
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', user: data })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', user: null })
      })
    return () => {
      cancelled = true
    }
  }, [isAuthed, token, attempt])

  return { ...state, retry: () => setAttempt((n) => n + 1) }
}

// Always re-fetches the logged-in user on mount instead of trusting the
// cached copy in localStorage indefinitely — the cache can go stale when a
// user's role changes server-side after they logged in.
export function useCurrentUser() {
  // Subscribed, so a sign-out (or a session the server confirmed dead) flips
  // this at once - the native app has no page reload to rely on.
  const token = useSyncExternalStore(subscribeAuth, getToken, () => null)
  const isAuthed = Boolean(token)
  const [user, setLocalUser] = useState(getUser())
  const [loading, setLoading] = useState(isAuthed)

  useEffect(() => {
    if (!isAuthed) {
      setLoading(false)
      setLocalUser(null)
      return
    }
    let cancelled = false
    fetchCurrentUser()
      .then((data) => {
        if (!cancelled) setLocalUser(data)
      })
      // Network/5xx: keep the cached user, the session is untouched.
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthed])

  // After an edit (e.g. setting a nickname): swap in the server's updated
  // user here and in the localStorage cache other pages read from.
  function replaceUser(updated) {
    if (!updated) return
    setUser(updated)
    setLocalUser(updated)
  }

  return { user, isAuthed, loading, replaceUser }
}
