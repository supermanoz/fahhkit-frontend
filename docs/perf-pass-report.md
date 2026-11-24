# Perf pass report

Branch `perf-pass`, cut from `frontend-health` (unmerged, so it carries those commits). No push, no app
builds. Frontend only. Another session was editing `GamePage.jsx`, `TerritoryMap.jsx`, `GameSettings.jsx`
and `GameButton.*` in the same folder the whole time, so nothing in those files was touched.

## Audit and status

| #   | Item                    | Status                                 | Where                                                                                                                                                                                                              | Evidence                                                                                                                                                                                                                                                                                                                   |
| --- | ----------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Skeleton loading        | **partial, existing**                  | `src/game/ui/Misc.jsx` (`Skeleton`, `.g-skeleton`), `MailStates.jsx`, `MailPanel`, `ClubPanel`, `ClubWarHistory`, `LeaderboardPodium`, `NotificationsSection`, `TerritoryPopup`, `PvpResultPopup`, `ProfileAvatar` | Shimmer skeletons exist for mail, club, leaderboard, territory popup, PvP result. Plain "Loading..." text remains in `GamePage.jsx`, `AthleteTerritoryProfilePanel.jsx`, `HistoryPage`, `RunDetailPage` and the admin pages. **Not changed in this pass** (needs `GamePage.jsx`)                                           |
| 2   | Duplicate API calls     | **done (concurrent), partial overall** | `src/utils/requestCache.js` (new), `src/api/client.js` `getJson`                                                                                                                                                   | Concurrent identical GETs now share one request. Walkthrough: 62 -> 56 API requests, 32 -> 28 repeats. The rest are sequential re-fetches on every open / tab switch (see Next)                                                                                                                                            |
| 3   | Pagination              | **already implemented**                | `api/mail.js`, `api/club.js`, `api/runs.js`, `api/store.js`, `hooks/useLeaderboardPages.js`                                                                                                                        | All list endpoints take `pageNumber` + `noOfRecords`; the leaderboard pages 20 rows with page cache, retry and error state. `getRuns` defaults to 500 per page and `getStoreCatalog` to 200 (see Backend asks)                                                                                                             |
| 4   | Caching                 | **partial**                            | `src/utils/requestCache.js`, `src/api/store.js`, existing `utils/profileCache.js`, `utils/heroManifest.js`, `hooks/useRolloutStatus.js`                                                                            | New bounded (60 entries) TTL cache with `peek` for stale-while-revalidate and prefix invalidation. Wired for the store catalog (60 s TTL, dropped by purchase / equip / unequip / claim). Profile cache and sprite cache already existed                                                                                   |
| 5   | Optimistic UI           | **done, existing**                     | `src/hooks/useMailbox.js`                                                                                                                                                                                          | Mail delete and mark-read are optimistic with rollback. Equip already flips at once and reverts on failure (`equipped-state.spec.js`). Purchases, coin balance, daily reward, run results, XP, territory, PvP stakes and club creation are deliberately NOT optimistic                                                     |
| 6   | Background work / queue | **partial, existing**                  | `utils/visibleInterval.js`, offline outbox (`useRunSync`), `utils/connectivity.js`                                                                                                                                 | No `Worker` and no `requestIdleCallback` anywhere. Not added: no measured >16 ms task, and the startup path lives in `main.jsx` / `GamePage.jsx`. See Backend asks for server-side jobs                                                                                                                                    |
| 7   | Lazy loading            | **mostly done, existing**              | 24+ `<img loading="lazy">`                                                                                                                                                                                         | Remaining `<img>` without `loading` are above the fold (navbar, loading backdrop, auth logo, landing hero) or in modals. Sprite sheets load per hero (`utils/spriteSheetCache.js`)                                                                                                                                         |
| 8   | Unused dependencies     | **done**                               | `package.json`, `package-lock.json`                                                                                                                                                                                | `depcheck` flagged `@fontsource/fredoka`, `noto-sans-devanagari`, `nunito`. Zero references in `src`, `index.html`, `vite.config.js`, `scripts`, native config. Removed (5 MB in `node_modules`, 42 lock lines). `postcss` is only a test import (kept). `@reduxjs/toolkit` is a recharts peer, not listed directly (kept) |

## Cache choice

A small custom layer (`requestCache.js`, about 50 lines) instead of TanStack Query. The app has no React data
layer today: screens call `api/*.js` from hooks and keep their own state, so adopting TanStack Query would mean
rewriting every screen's fetching, which is a large behaviour risk for a gain this size. The custom layer plugs
in at the API function level with zero call-site changes. Money-related data (`/v1/store/owned`, balances,
profile) is only de-duplicated while in flight, never served from the TTL cache. Persistence across restarts
was not added (the existing profile cache already covers the HUD offline).

## Changes (one commit each)

| Commit     | Item                                                                                   |
| ---------- | -------------------------------------------------------------------------------------- |
| `1c993326` | 2 + 4: in-flight GET de-duplication, TTL catalog cache with invalidation, 5 unit tests |
| `9b9ce2e7` | 8: removed the three `@fontsource/*` packages                                          |

## Measurements (production build, mobile-390, mocked API)

| Metric                                                                                                   | Before | After                                                      |
| -------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------- |
| JS gzip total                                                                                            | 870 kB | 882 kB (+12 kB: vendor-map split overhead, error boundary) |
| API requests in the scripted walkthrough (run, reload, Me, Shop, Club, Leaderboard, Mail, Settings, PvP) | 62     | 56                                                         |
| Repeated identical API requests                                                                          | 32     | 28                                                         |
| Unit tests                                                                                               | 1082   | 1101                                                       |

Not measured: time to first paint of the map and shop under 4x CPU + Fast 3G. It needs a stable dedicated
server (the shared dev server was flaky and was being edited), so there is no honest number to give.

Test note: a few shop specs time out under 3 parallel workers on the preview server
(`ownership-state.spec.js:162` passes 3/3 when run alone; `:178` fails without my change too).
The walkthrough's "after" run had 2 steps time out on a flaky run; the "before" run had 0.

## Deliberately not done, and why

- Skeletons for `GamePage.jsx` loading text, post-run results and payment-status: those live in a file another
  session was editing. Do them next, using the existing `Skeleton` from `src/game/ui`.
- Optimistic equip / social toggles beyond what exists: already covered.
- Web Worker / idle scheduling: no measured long task; adding one blind is churn.
- Persisting the cache across restarts: the safe subset (profile) is already persisted.

## Next steps (priority)

1. Stop re-fetching on every tab open: use `cached()` / `peek()` for the rollout status (5 repeats), profile
   (4), owned items (3, with refresh on screen open) and mail pages (3 each) in the walkthrough.
2. Replace the remaining "Loading..." texts with `Skeleton` once `GamePage.jsx` is free.
3. Lazy-load Club / Mail / PvP / Settings / tour / hero modals with an idle prefetch.
4. Measure first paint under throttling on a dedicated server.

## Backend asks (for Manoj)

- `POST /v1/run/find`: default `noOfRecords` is 500 from the client. Add a server max (for example 50) and a
  stable sort (`startedAt desc, id desc`), so history can use infinite scroll.
- `POST /v1/store/catalog/find`: client asks for 200. Add a max and `ETag` / `Last-Modified` so the catalog
  can be revalidated with a 304.
- `GET /v1/store/owned`, `/v1/store/equipped`, `/v1/territory/profile`, `/v1/rollout-request/status`: cheap
  `ETag` support (304) would make repeat opens nearly free.
- Heavy work to turn into background jobs, pattern: accept the request, return `202` + job id and status URL,
  push the result over the existing WebSocket / push, client shows a pending state: post-run territory
  recalculation and scoring, reward / XP processing, leaderboard recompute, push notification fan-out,
  PvP result resolution.
