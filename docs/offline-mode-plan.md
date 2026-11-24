# Offline mode - audit + plan

## 1. What breaks offline today (audit)

| Area                        | Today offline                                                                                                                                                                                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Map tiles                   | Base map is vector tiles (maplibre-gl-leaflet, openfreemap). Offline = blank/dark map; markers, territories and the live path still render (they are our own layers). No tile cache.                                                                                                                             |
| Startup API calls           | Profile, rollout status, shop/heroes, mail, daily-login, welcome bonus, weather, nearby parcels all fail. Each already catches errors; rollout **fails open** (kept). Nothing is cached, so the HUD shows empty/zero balances.                                                                                   |
| Auth                        | JWT in `localStorage` (+ native Preferences mirror). `client.js` already treats network errors (`ApiError.status === 0`), timeouts and 5xx as "never sign out"; only a server-confirmed dead session signs out. Refresh endpoint doesn't exist yet (falls through to a probe). **Good: offline never logs out.** |
| WebSocket (STOMP)           | `useGameSocket` reconnects every 5 s; offline it just retries. Live "run processed"/mail pushes simply don't arrive.                                                                                                                                                                                             |
| Post-run flow               | `attemptSubmit` -> `createRun` -> territory poll -> XP popup. Offline: "Couldn't save that run" + Retry; the run stays as one `pendingRun`.                                                                                                                                                                      |
| Push / live notification    | Push needs network (FCM). The Android/iOS run notification / Live Activity is local - unaffected.                                                                                                                                                                                                                |
| In-progress run persistence | `localStorage['fahhkit_active_run']`, written on every GPS point and at stop (`saveActiveRun`), restored by `useRunTracker` on mount (kill/crash recovery works). **One slot only**, and it doubles as "pending submit" (`stopped: true`). Local-storage quota / WebView eviction are the weak points.           |
| Idempotency                 | Body already carries `clientRunId = run-<startedAt ms>`; backend scopes it per user (see `attemptSubmit` comment).                                                                                                                                                                                               |

## 2. Decisions

- **Connectivity**: `src/utils/connectivity.js` is the single store (`useIsOnline`). Sources: `online`/`offline` events, app foreground (`appActivity`), and a **real probe** (`no-cors` request to the API host: any HTTP answer = reachable, only a network failure counts as offline). Offline is applied after ~2 s of stable failure (flap debounce); online is applied immediately on a successful probe or any successful API response. While offline it re-probes every 8 s.
  - _Deviation_: `@capacitor/network` is **not** added. It is a native plugin (needs `cap sync` + a rebuild on your side) and the events + probe already cover native WebViews. `connectivity.js` is the only place to plug it in later.
- **Network vs server errors**: `request()` already throws `ApiError(status 0)` for network failures; exported as `isNetworkError(err)` and fed to the connectivity store. Network errors never sign anyone out (unchanged).
- **Run storage**: new IndexedDB database `fahhkit-offline` with two stores: `activeRun` (write-through mirror of the in-progress run, throttled; used to recover when localStorage is empty/evicted) and `outbox` (finished runs waiting to upload, keyed by `clientRunId`, tagged with `userId`). The existing localStorage active-run stays the synchronous fast path (tracker code unchanged), IndexedDB is the durable copy.
- **clientRunId**: `run-<uuid>` created at run start (legacy `run-<startedAt>` still honoured for runs recorded before this change).
- **Outbox / sync** (`runSync.js`): one at a time, oldest first; statuses `waiting | uploading | done | failed`. Network/5xx/408/429 -> back to `waiting` with exponential backoff (5 s doubling, cap 5 min). Other 4xx -> `failed` with the server's reason, never retried automatically (user can Retry/Delete). 401/403 -> stay `waiting` (queue kept while logged out, flushes after login). Triggers: back online, app foreground, app start, login.
- **Idempotency header**: body `clientRunId` always; `Idempotency-Key` header only when `VITE_IDEMPOTENCY_HEADER=true`, because a new request header needs a CORS allow-list entry on the backend first (otherwise every run submit would fail its preflight). See `offline-runs-backend.md`.
- **Offline UX**: banner pill; online-only menu entries shaded with a "Needs internet" toast; Training/Conquer recordable offline; PvP/Club War blocked; post-run "Run saved" popup; pending-runs list in the Me tab.
- **Map tiles**: offline fallback = solid themed background (no broken tiles). _Tile caching is deferred_: service workers don't run in the iOS/Android WebViews (`capacitor://`), so it would be web-only; a proper app-wide cache should wrap the vector-tile fetch (maplibre `transformRequest` + Cache API) and needs its own size budget - not done here.

## 3. Phases

1. Connectivity store + banner
2. Online-only features shaded / blocked
3. Offline recording (IndexedDB mirror, clientRunId) + outbox/sync engine
4. Post-run offline popup + pending-runs list + "submitted" results
5. Docs (`offline-runs-backend.md`) + Playwright/Vitest tests + screenshots

## 4. Status / what is NOT done

Done: connectivity store + banner, shaded online-only features, IndexedDB active-run mirror
and outbox, sync engine (ordered, idempotent, backoff, per-account), "Run saved" popup,
Pending runs list, "submitted" results flow, logout warning, tests (Vitest + Playwright).

Not done / limits:

- **Map tile cache** (deferred, see Decisions). Offline the basemap is the dark background;
  the player, path and territories still render.
- **`@capacitor/network`** not added (needs a native rebuild); the probe covers it.
- **Hero/trail used** is stored as `meta.heroId` only (trail not tracked client-side).
- **Storage quota**: IndexedDB write errors fall back to memory for the session (a warning is
  logged); there is no UI for "storage full" yet.
- **First-ever launch offline** needs one online login (the token is the only thing the app
  cannot invent); an already signed-in player can open the app offline.
- Several runs finishing sync at once: each gets a toast, only the last one gets the full
  results flow.
- Native (Capacitor iOS/Android) was not run here; behaviour is the same JS in the WebView.
- The idempotency **header** is opt-in until the backend CORS allows it.
