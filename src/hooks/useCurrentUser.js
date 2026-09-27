import { useEffect, useState } from 'react'
import { getJson, getToken, getUser, setUser } from '../api/client'

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

// Always re-fetches the logged-in user on mount instead of trusting the
// cached copy in localStorage indefinitely — the cache can go stale when a
// user's role changes server-side after they logged in.
export function useCurrentUser() {
  const isAuthed = Boolean(getToken())
  const [user, setLocalUser] = useState(getUser())
  const [loading, setLoading] = useState(isAuthed)

  useEffect(() => {
    if (!isAuthed) {
      setLoading(false)
      return
    }
    let cancelled = false
    fetchCurrentUser()
      .then((data) => {
        if (!cancelled) setLocalUser(data)
      })
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
