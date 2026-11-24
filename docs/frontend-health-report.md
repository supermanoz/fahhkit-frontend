# Frontend health report

Branch `frontend-health` (from `main`, not pushed, no app builds). One commit per phase;
see "How to revert" at the end. Frontend only, no backend changes.

## Before (Phase 0 baseline)

Measured on the commit `e86b7167` ("snapshot of in-progress work"), which is the state the
health pass started from.

| Metric                       | Before                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `npm run build`              | passes, 5.4 s                                                                                                       |
| `dist/` total                | 125 MB (96 MB of it is 181 webp sprite sheets, 10 MB png, 4.2 MB mp3)                                               |
| JS + CSS shipped             | 3.49 MB (167 js files 2.79 MB, 4 css files 0.53 MB)                                                                 |
| Largest chunks               | `index-*.js` 2,231 kB (no split of the game), `WebShell-*.js` 620 kB, `index-*.css` 454 kB, `WebShell-*.css` 101 kB |
| Everything else              | 163 small js chunks, all under 24 kB                                                                                |
| Lazy-loaded in `GamePage`    | only `GameAuthGate` (every panel and popup is a static import)                                                      |
| Source maps in `dist`        | 0                                                                                                                   |
| `npm audit` (prod deps)      | 2 moderate (`react-router` / `react-router-dom` 6.30.6, fix is the 7.x major)                                       |
| `npm audit` (all deps)       | 23: 11 moderate, 9 high, 3 critical (dev tooling)                                                                   |
| ESLint                       | 2 errors, 5 warnings. The 2 errors are `clear/` (a 436 MB conda install inside the repo, not our code)              |
| ESLint (own code only)       | 0 errors, 5 warnings (3 `react-refresh/only-export-components`, 2 `react-hooks/exhaustive-deps`)                    |
| Unit tests (vitest)          | 109 files, 1082 tests, all pass                                                                                     |
| Smoke run, console errors    | 10 (all `WebSocket connection to wss://.../ws failed` because the test env has no backend)                          |
| Smoke run, console warnings  | 15 (React Router v7 future flags 4, MapLibre style filter 6, rollout status check 4, canvas size 1)                 |
| Smoke run, page errors / 5xx | 0 / 0                                                                                                               |

The smoke run is `e2e/health-smoke.spec.js` (new): resumed run ended and submitted, reload, then
Me, Shop, Club, Leaderboard, Mail, Settings and PvP opened in turn, on a mocked API.
It counts errors, it does not fail on them. All 10 steps pass.

E2E baseline (core subset, mobile-390): see the Phase 5 table.

## Phase 1 - Stability (partial)

| Severity | File                           | Issue                                                                        | Change                                                                                                              |
| -------- | ------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| High     | `src/main.jsx`                 | No error boundary: any render error blanked the app                          | Top-level `ErrorBoundary` (`src/components/ErrorBoundary.jsx`) with a "Reload" fallback, plus a unit test           |
| Medium   | `src/utils/globalErrors.js`    | No `window.onerror` / `unhandledrejection` handling                          | Handlers log name, message and stack only; URL query strings and JWT/bearer values are scrubbed; capped at 20 lines |
| High     | `src/api/client.js`            | `getUser()` `JSON.parse` unguarded: corrupt stored user crashed every screen | try/catch, non-object returns null                                                                                  |
| High     | `src/api/client.js`            | `fetch` had no timeout: a hung connection meant an endless spinner           | 45 s `AbortSignal.timeout` (when supported); a timeout takes the existing fallback-host / offline path              |
| Low      | `src/api/client.js`            | `sessionStorage` access could throw when storage is blocked                  | wrapped                                                                                                             |
| Low      | `useCountdown`, `VehicleAlert` | 1 s / 0.5 s intervals kept running while the app was hidden                  | now `visibleInterval` (pauses when hidden, catches up on return)                                                    |

Not done yet (needs `GamePage.jsx`, which another session is editing in this folder): per-feature boundaries
(map, shop, club, PvP, mail, post-run popups), the PvP queue poll and 5 s distance interval in `GamePage`/`usePvp`,
WebSocket pause while offline/hidden, modal stacking review.

## Phase 2 - Performance (partial)

| Change                                                                 | File               | Effect                                                                                                                                                                                  |
| ---------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin / organiser / account pages lazy-loaded (17 pages)               | `src/WebShell.jsx` | `WebShell` chunk 620 kB -> 112 kB; each page loads on demand                                                                                                                            |
| Map libraries (maplibre-gl, leaflet, react-leaflet) in their own chunk | `vite.config.js`   | `index` 2,231 kB -> 888 kB + `vendor-map` 1,324 kB (parallel load, cached across deploys). Total bytes are the same; first-party code no longer re-downloads when only app code changes |
| `console.log` / `console.debug` / `debugger` dropped in production     | `vite.config.js`   | 0 `console.log` left in the bundle (was 13 console calls); `warn` / `error` / `info` kept for the `[auth]` trail                                                                        |

Not done: lazy-loading the game panels (Club, Mail, PvP, Settings, tour, hero detail, legal, reward modals).
They are static imports in `GamePage.jsx`, which another session is editing; recommended next step, with an
idle-time prefetch so the first open does not flash. Also not done: asset pass (96 MB of sprite sheets, 4.2 MB mp3),
re-render profiling, CSS animation audit.

Bundle top (source size before minify, from a throwaway sourcemap build): react-icons 1.3 MB (tree-shaken in the
real bundle), maplibre-gl 1.07 MB, recharts 0.8 MB, leaflet 0.44 MB, motion-dom 0.34 MB, react-router 0.19 MB,
animejs 0.14 MB, react-dom 0.13 MB, framer-motion 0.12 MB, stomp 0.09 MB. Own code: `GamePage.jsx` 301 kB,
`TerritoryMap.jsx` 87 kB, `ClubPanel.jsx` 55 kB, `PvpPanel.jsx` 46 kB.

## Phase 3 - Cleanup (partial)

- ESLint no longer scans `clear/` (a 436 MB conda install in the repo root): the 2 "errors" were from there.
  `clear/` should be moved out of the repo or git-ignored (it is untracked and was never committed).
- Not done: knip/depcheck pass, unused CSS, removing leftover screenshots, GameButton/token consolidation.
  Nothing was deleted without proof, so nothing was deleted.

## Phase 4 - Security (review so far, no code changes beyond the above)

- Already good: CSP / HSTS / X-Frame-Options / nosniff / Permissions-Policy in `netlify.toml` and `vercel.json`;
  `usesCleartextTraffic=false`, `allowBackup=false`, `allowMixedContent=false`, WebView debugging off,
  `allowNavigation` limited to the API host; no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`
  or `postMessage` in `src/`; `safeUrl.js` guards server links and payment URLs; `?next=` same-origin only
  (covered by `auth-guard.spec.js`); no source maps in `dist`.
- `npm audit` prod: 2 moderate, both `react-router` 6.30.6 (open redirect via backslash, SSR hydration
  injection). The fix is react-router 7.x (major), so it is listed, not forced. The app is client-only, so the
  SSR one does not apply; the backslash redirect is covered by our own `next` check.
- Needs backend (for Manoj): WebSocket (`/ws`) is connected without an auth token, server must authorise
  subscriptions to `/specific/{userId}`; server-side re-verification of run results; token refresh / revocation.
- Not reviewed yet: JWT storage plan (currently localStorage mirrored via `authStorage`; options are Capacitor
  Preferences or Keychain/Keystore plugin), deep-link handling of `runconquest://payment-return`, the debug
  panel code that ships in production (reachable only through the hidden settings switch).
- Test hygiene: e2e runs still try to open `wss://cafebizarre.com.np/fahhkit/ws` (the real API host).

## Known pre-existing test failures (fail on the untouched baseline commit too)

- `post-run-flow.spec.js` "post-run sequence: pvp" (stale: expects an old "Submit Run" button).
- `auth-guard.spec.js` lines 131, 143, 176 (session-ends redirect tests).

_Phase 5 (full re-verify, before/after table, how to revert) is not done yet._
