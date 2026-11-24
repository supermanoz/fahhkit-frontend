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

_The rest of this file is filled in phase by phase._
