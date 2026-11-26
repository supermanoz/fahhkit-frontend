# Offline mode: frontend state and plan

Audited 2026-11-26 on branch `nickname-names`. Documentation only: no code was changed to
produce this. Paths are under `src/` unless noted; line numbers are from the working tree on
that date. Pair this with `docs/offline-backend.md`.

**The short version.** Most of offline mode is **already built and committed** (snapshot commit
`e86b7167`, 2026-11-24): a connectivity store, a banner, a crash-safe active-run mirror in
IndexedDB, an outbox with `clientRunId`, an ordered upload engine with backoff, an offline
"Run saved" popup, a pending-runs list, shaded online-only features, and tests. So the plan
below is not a rewrite: each phase says what is **done**, what is **missing**, and what it
needs from the backend. The real gaps are: no GPX export, no map tile cache, the app does not
use the server's error code, time-zone-unsafe timestamps, a per-point full-record write for crash
recovery, and several smaller edge cases (section 3).

`docs/offline-mode-plan.md` and `docs/offline-runs-backend.md` describe the earlier plan; where
they disagree with this file, this file reflects the code.

---

## Implementation status (updated 2026-11-27)

The backend commits `8a28b86`, `ab97e0e` (steps/elevation, epoch times, offline marker, late rules,
recoverable processing) landed, so the client side was built. The backend still has **no**
capability endpoint (BE 3.10), **no** `retryable` flag and **no** lookup by `clientRunId`, so
anything gated on those is not built. New fields are sent unconditionally (an older server ignores
unknown JSON fields).

| Item                                                                                                                                           | Status                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Epoch `startedAtEpochMs`/`endedAtEpochMs`, `offline`, `appVersion`, `platform`, `clientSentAtEpochMs` (gap 1, 3)                               | **Done** (`utils/runPayload.js`, `api/runs.js`)                                                                                                                                                                                                                                           |
| `ApiError.errorCode` and plain-language run errors (gap 2)                                                                                     | **Done** (`api/client.js`, `utils/runErrors.js`); `retryable` not built (backend has none)                                                                                                                                                                                                |
| Late-run rule (48 h) and deadline (14 d) in the popup, pending list and result card                                                            | **Done** (`utils/runLate.js`)                                                                                                                                                                                                                                                             |
| Result of a queued run from `GET /v1/run/{id}/score-breakdown` (Phase 5.3) incl. `FAILED`                                                      | **Done** (`GamePage.jsx` `pollForTerritoryResult`)                                                                                                                                                                                                                                        |
| Pending list: Sync now, Delete for waiting runs (with confirm), Export GPX, expiry (Phase 6)                                                   | **Done** (`components/PendingRunsList.jsx`, `utils/gpx.js`, `utils/exportGpx.js`)                                                                                                                                                                                                         |
| Banner counts, "uploading N runs", tap to open the list, storage-full state (Phase 2, 9)                                                       | **Done** (`components/ConnectionBanner.jsx`, `utils/storageHealth.js`)                                                                                                                                                                                                                    |
| Several runs syncing together: one summary toast, full result for the newest only (gap 8)                                                      | **Done**                                                                                                                                                                                                                                                                                  |
| Crash-recovery write cost (gap 5)                                                                                                              | **Reduced**, not redesigned: the whole-record `localStorage` write is coalesced to one per 2 s (stop, pause, first write and app-hidden write at once). Incremental IndexedDB point store (Phase 3) is **not built**: it rewrites the live-run recovery path and needs on-device testing. |
| Map offline chip (Phase 8 option A)                                                                                                            | **Done** ("Map tiles may not load offline")                                                                                                                                                                                                                                               |
| Tests (Phase 10): outbox, memory db, GPX, active-run writes, pending list, banner, offline features, interrupted/duplicate sync                | **Done** (unit/component). New Playwright scenarios not added.                                                                                                                                                                                                                            |
| Capability gating, clock-skew warning, "not rolled out" warning when offline (gap 9), sign-in-to-upload hint, batch upload, idempotency header | **Not built** (need backend 3.10, or low value / decided "no")                                                                                                                                                                                                                            |

---

## 1. Current state

### 1.1 What a run sends today

`buildRunPayload` (`utils/runPayload.js:20-33`), used by both the normal submit and the outbox:

| Field                      | Value                          | Notes                                                                                                                                    |
| -------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `eventId`                  | `null`                         |                                                                                                                                          |
| `points`                   | the tracker's points           | `{lat, lng, timestamp (epoch ms), accuracy, speed, ...}`, already noise-filtered by `utils/distanceFilter.js`                            |
| `distance`                 | meters                         |                                                                                                                                          |
| `duration`                 | seconds (moving time)          |                                                                                                                                          |
| `startedAt`, `endedAt`     | `"YYYY-MM-DDTHH:mm:ss"`        | **device-local time, no offset** (`toLocalDateTimeString`, `utils/run.js:228-234`)                                                       |
| `challengeId`, `clubWarId` | only when set                  | PvP / Club War                                                                                                                           |
| `clientRunId`              | `run-<uuid>`                   | created once at run start (`utils/clientRunId.js:6-13`), persisted with the run; legacy `run-<startedAt ms>` is still honored (`:16-22`) |
| `mode`                     | `"TRAINING"` for Training only | other modes omit it so the server derives them                                                                                           |

**Not sent** (kept locally only, in the outbox record's `meta`, `buildRunMeta`
`utils/runPayload.js:53-71`): `platform`, `appVersion` (`VITE_APP_VERSION`), `userAgent`,
`tzOffsetMinutes`, `queuedAtClientMs`, `heroId`. There is no `offline` flag and no epoch
`startedAt`/`endedAt`. The comment in `api/runs.js:11-19` about vehicle telemetry fields is out
of date: `buildRunPayload` sends none of them.

Route size: points are about 100-150 bytes of JSON each (estimate, not measured), so a 1 h run at
1 fix/s is on the order of 400 KB. There is no client-side cap on point count.

Client-only run minimums, **not enforced by the server** (`utils/run.js:11-12`):
`MIN_VALID_RUN_DISTANCE_METERS = 100`, `MIN_VALID_RUN_DURATION_SECONDS = 30`. They are checked in
`attemptSubmit` (`pages/GamePage.jsx:3894` onward) before a run can reach the outbox.

### 1.2 How responses are handled

- Online submit: `attemptSubmit` (`GamePage.jsx:3894`) calls `createRun` (`api/runs.js:27-35`,
  `POST /v1/run`) and then `presentSubmittedRun` (`:3742`).
- **Network failure** (`isNetworkError`, `api/client.js:147`) while signed in: the run goes to the
  outbox (`queueRunForUpload`, `GamePage.jsx:3831-3862`) and the "Run saved" popup shows
  (`setOfflineSavedRun`). This also covers "online but the server is unreachable".
- Any other error: "Couldn't save that run" with Retry; the run stays as the pending run.
- Conquer result: `pollForTerritoryResult` (`GamePage.jsx:3993-4035`) polls
  `findMyTerritoryEvents` every `RESULT_POLL_DELAY_MS = 2500` ms up to `RESULT_POLL_ATTEMPTS = 6`
  (`:451-452`, about 15 s) and accepts events whose `occurredAt >= submittedAt`, then shows a
  timeout state. It is also settled early by the WebSocket run-processed message
  (`settledRunIdRef`). **`occurredAt` is a server (Kathmandu) time without offset, parsed as
  device-local time and compared to the device clock**, so it is wrong on a phone outside
  Nepal's time zone and sensitive to clock skew.
- The error `errorMessage` becomes `ApiError.message` (`api/client.js:499`); `errorCode` and any
  `retryable` flag are **ignored**. All decisions use the HTTP status.
- A run that comes back from the outbox goes through `handleSyncedRun` (`GamePage.jsx:3864-3893`):
  a toast, then the normal result flow (`presentSubmittedRun(..., { fromQueue: true })`), or just a
  profile refresh if the player is mid-run.
- `POST /v1/run/batch` exists on the backend but the app never calls it.
- `Idempotency-Key` header: opt-in via `VITE_IDEMPOTENCY_HEADER=true` (`api/runs.js:24-25`).
  The backend CORS already allows all headers, so it can be turned on; the body `clientRunId` is
  the source of truth either way.

### 1.3 How an in-progress run is persisted (crash recovery)

- Primary: `localStorage['fahhkit_active_run']`, written by `saveActiveRun`
  (`utils/run.js:140-147`) with the **whole record serialized on every GPS point** (and at pause,
  resume and stop: `hooks/useRunTracker.js:598,809,913,979`). Cost grows with run length.
- Secondary: a write-through mirror in IndexedDB store `activeRun`, key `current`
  (`utils/run.js:99-138`), throttled to one trailing write per 2.5 s (`MIRROR_EVERY_MS`) and
  written immediately for the final `stopped` record. If `localStorage` is full or evicted
  (`catch` at `:143-145`), only this mirror survives.
- Restore: `recoverActiveRun()` runs before the first render (`main.jsx:27`) and copies the
  mirror back if it belongs to the signed-in account; `useRunTracker` then restores either a
  running run (`useRunTracker.js:641` onward) or a stopped one as the pending run. The
  vehicle-detection state is not restored (the anti-cheat restarts clean from RUNNING).
- A recorded run is queued to the outbox only when submit is attempted and fails with a network
  error; a stopped-but-unsubmitted run lives in the active-run record (not the outbox) until then.

### 1.4 The outbox, sync engine and UI (all present)

| Piece           | File                                  | Notes                                                                                                                                                                                                                                                  |
| --------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DB wrapper      | `utils/offlineDb.js`                  | IndexedDB `fahhkit-offline`, version 1, stores `activeRun` and `outbox`; falls back to an in-memory `Map` for tests or private modes (`:6-29,70-95`). No schema migration code yet beyond v1.                                                          |
| Outbox          | `utils/runOutbox.js`                  | One record per run keyed by `clientRunId`, tagged with `userId`. Done records are pruned after 24 h (`DONE_KEEP_MS`, `:19,83-92`).                                                                                                                     |
| Sync engine     | `utils/runSync.js`                    | One at a time, oldest first; `classifyError` (`:21-30`); backoff 5 s doubling to 5 min (`:13-18`).                                                                                                                                                     |
| Trigger hook    | `hooks/useRunSync.js`                 | Flushes on login/account change, when the connection returns, when the app returns to the foreground, and when a backoff timer fires (`:23-53`). Skips when offline (`:24`).                                                                           |
| Connectivity    | `utils/connectivity.js`               | One store: `online`/`offline` events, foreground, and a real probe (4 s timeout, `:23`); offline is applied after a 2 s debounce (`:21`), re-probes every 8 s offline (`:22`), `useIsOnline`. Started in `main.jsx`. `@capacitor/network` is not used. |
| Banner          | `components/ConnectionBanner.jsx`     | Offline pill and a 3 s "Back online" pill (`GamePage.jsx:5172`).                                                                                                                                                                                       |
| Run-saved popup | `components/OfflineRunSavedModal.jsx` | Shown by `queueRunForUpload`.                                                                                                                                                                                                                          |
| Pending list    | `components/PendingRunsList.jsx`      | In the Me tab (`GamePage.jsx:6934`): status per run; **Retry** and **Delete** for failed runs only; waiting/uploading runs cannot be deleted.                                                                                                          |
| Shading         | `utils/offlineFeatures.js`            | `OFFLINE_BLOCKED_TABS` = leaderboard, club (incl. Club War), shop, mail, race; `OFFLINE_BLOCKED_PLAY` = race, club-war. Used at `GamePage.jsx:5304,6238`. Tapping shows "Needs internet".                                                              |

Status machine (`runOutbox.js:6`, `runSync.js:46-98`):

```
          enqueue
             |
             v
        [waiting] --(send)--> [uploading] --2xx--> [done] --(24 h)--> pruned
          ^   ^                   |
          |   |   network / 401 / 403 -> [waiting] (no penalty, stop)
          |   +--- 408 / 425 / 429 / 5xx -> [waiting], attempts+1, backoff (stop)
          |                       |
   player Retry                   +-- any other 4xx -> [failed] (continue with next run)
          |                                   |
          +-----------------------------------+
   app killed mid-upload: [uploading] -> [waiting] on the next flush (the idempotent resend is safe)
```

Outbox record (`runOutbox.js:7-10`):

```json
{
  "clientRunId": "run-…",
  "userId": "…",
  "status": "waiting|uploading|done|failed",
  "attempts": 0,
  "nextAttemptAt": 0,
  "createdAt": 0,
  "updatedAt": 0,
  "syncedAt": null,
  "error": { "message": "…", "status": 400 },
  "result": { "id": "…", "avgPace": 5.4 },
  "summary": {
    "mode": "…",
    "isTraining": false,
    "distance": 0,
    "duration": 0,
    "startedAt": "ISO",
    "endedAt": "ISO",
    "pointCount": 0,
    "challengeId": null,
    "clubWarId": null
  },
  "payload": { "...the POST /v1/run body...": "" },
  "meta": {
    "heroId": null,
    "platform": "android",
    "userAgent": "…",
    "appVersion": null,
    "tzOffsetMinutes": -345,
    "queuedAtClientMs": 0
  }
}
```

### 1.5 Startup and what breaks offline

Startup sequence (`main.jsx:20-31`): load stored session, `recoverActiveRun()`, start session
keeper and connectivity, render. Then in `GamePage`: current user (`useCurrentUser`, `:668`),
territory profile (`getTerritoryProfile`, `:2491`), nearby parcels (`findParcelsNear`, `:2599`),
rollout status (`useRolloutStatus`, `:745`, `hooks/useRolloutStatus.js:160`), mailbox
(`useMailbox`, `:1559`), daily reward (`:4668`), welcome bonus (`:2401`), territory rules
(`initTerritoryRules`, `:4303`), push registration (`:2108`), and the WebSocket (`useGameSocket`,
`:1692`).

| Area                 | What happens offline                                                                                                                                                                                                                                                                                                                                   | Evidence |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Map tiles            | Vector tiles come from the style URL (`mapConfig.defaultStyleUrl`, `components/TerritoryMap.jsx:74,184`); offline the base map is the themed dark background, while markers, territories and the live path still draw (our own layers). Only an in-memory tile cache (`maxTileCacheSize: 1000`, `:~190`). No service worker, no persistent tile cache. |          |
| Token refresh        | `request()` turns network failures and timeouts (45 s, `api/client.js:44-49,81-94`) into `ApiError(status 0)`. A refresh is single-flight, uses the current JWT as the bearer and works up to 7 days past expiry (`client.js:280-410`). Network errors, timeouts and 5xx never sign anyone out.                                                        |          |
| WebSocket            | STOMP reconnect every 5 s, heartbeats 10 s (`hooks/useGameSocket.js:48-50`); offline it just retries, and run-processed/mail pushes are missed.                                                                                                                                                                                                        |          |
| Post-run             | Conquer, Training: saved to the outbox with the "Run saved" popup. PvP/Club War: a versus run that ends offline is queued and the PvP popup says it needs a connection (`GamePage.jsx:3843-3858`).                                                                                                                                                     |          |
| Rollout check        | Fails open (the game stays unlocked) when the call fails.                                                                                                                                                                                                                                                                                              |          |
| Push / Live Activity | FCM needs a network; the local run notification and Live Activity do not.                                                                                                                                                                                                                                                                              |          |
| Auth                 | Logging out keeps the outbox (records are per `userId`).                                                                                                                                                                                                                                                                                               |          |

---

## 2. Findings and gaps (verified)

1. **Time zone / clock skew.** `startedAt`/`endedAt` have no offset, and the territory poll
   compares server `occurredAt` with the device clock (1.2). Fix needs backend 3.2 of the backend
   doc (epoch fields) and a different "did my run finish" signal.
2. **`errorCode` and `retryable` are dropped** (`client.js:499`). Today a 400 is always
   "permanent", which is right for current business errors but cannot distinguish a future
   retryable 400.
3. **Context fields stay local.** `offline`, `appVersion`, `platform`, `queuedAtClientMs` are never
   sent, so the server cannot label late runs (backend 3.5).
4. **No GPX export** and no "share my raw run" path (grep for `gpx` finds nothing).
5. **Crash-recovery write cost.** Whole-record `JSON.stringify` to `localStorage` per point (1.3);
   O(n) per write, O(n squared) per run, and `localStorage` is about 5 MB shared with everything
   else. IndexedDB is only a throttled copy.
6. **No storage-full UI.** IndexedDB failures silently fall back to memory (`offlineDb.js:70-95`,
   logged with `console.warn`); a run then lives only in memory for that session.
7. **No visible deadline.** A queued run becomes permanently invalid after the server's max age
   (14 days by default), and the player is never told it is expiring.
8. **Several runs syncing at once:** each gets a toast, but only the last gets the full result
   flow.
9. **Offline Conquer in a city that is not rolled out:** rollout fails open offline, so the player
   records a run that the server later scores as `TERRITORY_NOT_ROLLED_OUT`.
10. **Client minimums are stricter than the server:** 100 m / 30 s here, none on the server.
11. **Tests.** Present: `utils/connectivity.test.js`, `utils/runSync.test.js`, `e2e/offline.spec.js`
    (with screenshots in `screenshots/offline/`). No unit tests were found by file name for
    `runOutbox.js`, `offlineDb.js`, `useRunSync.js`, `PendingRunsList.jsx`, `ConnectionBanner.jsx`
    or `OfflineRunSavedModal.jsx`.
12. **Idempotency header is off** although the backend now allows it (low value; the body field
    already makes retries safe).

---

## 3. Implementation plan by phase

Each phase lists status, files, schema, backend dependency (**BE n.n** = section in
`docs/offline-backend.md`), and how it degrades without it.

### Phase 1: Connectivity layer. Status: **done**

- Files: `utils/connectivity.js`, `utils/appActivity.js`, `api/client.js` (reports successes and
  failures), `main.jsx`.
- Remaining (small): optionally feed `@capacitor/network` in as one more source (needs a native
  rebuild, not required); record `serverTimeEpochMs` from the capability endpoint and expose
  `clockSkewMs` so later phases can warn about a wrong device clock.
- Backend: BE 3.10 for server time. Without it: skew is unknown and nothing is warned.

### Phase 2: Banner states. Status: **done, minor additions**

- Files: `components/ConnectionBanner.jsx` (+ `.css`).
- States today: `offline`, `back online` (3 s), hidden. Add: `offline · N runs waiting` and
  `syncing…` while the outbox flushes, using `useRunSync().runs` and `pendingCount`
  (`runOutbox.js:95-99`). Tapping the pill opens the pending list.
- Backend: none. Without it: unchanged.

### Phase 3: Crash-safe run recording in IndexedDB. Status: **partial**

- Files: `utils/run.js` (`saveActiveRun`, `mirrorActiveRun`), `utils/offlineDb.js`,
  `hooks/useRunTracker.js`, `main.jsx` (`recoverActiveRun`).
- Change: make IndexedDB the primary store and write **incrementally**:
  - `activeRun` stays one small header record (ids, mode, startedAt, paused time, flags).
  - New store `activeRunPoints` with key `[runKey, seq]` and value one point; append in batches
    of about 10 points or 5 s (whichever first), never rewrite the whole array.
  - Keep a tiny `localStorage` pointer (`runKey`, `startedAt`, `lastSeq`) as the fast "is there a
    run to recover" check.
  - On recovery, read the header plus points by key range.
- Schema (IndexedDB version 2, additive; keep stores `activeRun` and `outbox`):

```
activeRun        key: 'current'                      value: { runKey, clientRunId, userId, mode, isTraining,
                                                      challengeId, clubWarId, startedAt, pausedMs, stopped,
                                                      endedAt, distance, duration, lastSeq, updatedAt }
activeRunPoints  key: [runKey, seq]                  value: { lat, lng, timestamp, accuracy, speed, ... }
```

- Migration: `onupgradeneeded` v1 to v2 adds the store; on first run after upgrade, if a legacy
  full `activeRun` record exists, split it into header + points once.
- Edge: storage full: surface an error banner ("Storage is full: this run can't be saved") and
  stop appending rather than failing silently (see Phase 9).
- Backend: none. Without it: n/a (client only).

### Phase 4: Offline post-run popup. Status: **done**

- Files: `components/OfflineRunSavedModal.jsx`, `GamePage.jsx:3831` (`queueRunForUpload`).
- Remaining: show the **deadline** ("Uploads automatically. Must reach the server within N days")
  from `maxAgeDays` (BE 3.10, fallback 14) and the distance/time summary. Do not show territory or
  XP numbers (they are only known after the server processes it).
- Backend: BE 3.10 for the real max age. Without it: use the built-in 14.

### Phase 5: Sync outbox. Status: **done core; needs hardening**

- Files: `utils/runSync.js`, `utils/runOutbox.js`, `hooks/useRunSync.js`, `api/runs.js`,
  `api/client.js`, `utils/runPayload.js`.
- Already has: `clientRunId`, oldest-first, backoff 5 s to 5 min, permanent vs retryable vs auth
  vs network classification, per-account queues, resend after app kill.
- Changes:
  1. Read `errorCode` and `retryable` in `client.js` (add `ApiError.code` and `.retryable`) and use
     them in `classifyError`: `retryable === true` wins; otherwise status as today. Record
     `errorCode` on the outbox `error` so the list can show specific, human text.
  2. Send the new context fields **when the backend advertises support**:
     `offline: true` (when queued), `appVersion`, `platform`, `clientSentAtEpochMs`,
     `startedAtEpochMs`, `endedAtEpochMs`. Gate on `supportsEpochTimestamps` from BE 3.10; if the
     capability call fails or is missing, send today's payload.
  3. Replace the territory-event time comparison for **queued** runs with the run's own
     processing result (WebSocket message or `GET /v1/run/{id}/score-breakdown`), so a late run
     does not depend on device-vs-Kathmandu clocks.
  4. When a run's `status` is `FAILED` from the server's processing (BE 3.1), show it as failed
     with the reason rather than as endless "processing".
  5. Optional: switch to `POST /v1/run/batch` when more than 3 runs are waiting; keep the single
     path as the default. Do **not** ship this unless needed.
  6. Keep the idempotency header off unless backend asks (the body key suffices).
- Outbox record additions (additive; old records without them still work): `meta.offline`,
  `error.code`, `error.retryable`, `expiresAt` (`endedAt + maxAgeDays`).
- Backend: BE 3.2, 3.5, 3.10, 3.13, 3.1. Without them: unchanged behavior (status-only
  classification, no new fields), so each item can ship independently.

### Phase 6: Pending runs list. Status: **partial**

- Files: `components/PendingRunsList.jsx`, `GamePage.jsx:6934`, `components/OfflineRuns.css`.
- Has: status labels, error text for failed runs, Retry and Delete (failed only).
- Add:
  - **Sync now** (calls `useRunSync().flush`).
  - **Delete** for `waiting` runs too, behind a confirm ("This run hasn't been saved yet. Delete
    it?"); never delete `uploading`.
  - **Export GPX** per run (new `utils/gpx.js`): GPX 1.1 `<trk><trkseg><trkpt lat lon><time>` from
    `record.payload.points` (`timestamp` to ISO time, `accuracy` omitted, `speed` as an extension
    if wanted). Share via the existing export flow (`hooks/useExportAction.js`, which the run-image
    download uses) or the native share sheet. Works for waiting, failed and done runs while the
    outbox record exists.
  - Show `expiresAt` ("Expires in 9 days") on waiting runs; failed-with-`RUN_TOO_OLD` runs offer
    **Export GPX** and **Delete** only (Retry cannot succeed).
- Schema: none beyond Phase 5 additions.
- Backend: none (GPX is local). Without BE 3.10: use the built-in 14-day max age.

### Phase 7: Shading of online-only features. Status: **done, verify coverage**

- Files: `utils/offlineFeatures.js`, `GamePage.jsx:5304,6238` (menu), `:5000` (daily reward).
- Has: leaderboard, club, shop, mail, race shaded with "Needs internet"; PvP/Club War blocked
  from starting.
- Check/add: any in-screen action that calls the API while offline (hero equip, profile edit,
  nickname, friends, report, settings that sync) should show the same "Needs internet" instead of
  a generic error; add a unit test over `OFFLINE_BLOCKED_TABS`/`OFFLINE_BLOCKED_PLAY`.
- Backend: none.

### Phase 8: Map tile fallback / cache. Status: **partial (fallback only)**

- Today: themed dark background when tiles fail; in-memory tile cache only.
- Options (recommend **A**):
  - **A. No persistent cache in v1.** Keep the dark fallback; add a small "Map unavailable
    offline" chip so a blank map isn't read as a bug. Zero storage risk.
  - **B. Opportunistic cache** of tiles already viewed, via a native HTTP cache or Capacitor
    Filesystem keyed by `z/x/y`, capped (for example 50 MB LRU). Needs `transformRequest`
    (`mapConfig.transformRequest`) to read from the cache first. Service workers do not run in
    the Capacitor WebViews, so this is native-only work.
  - **C. Downloadable regions** ("save this area"): biggest build, biggest storage.
- Backend: none. Degradation: A is the current behavior.

### Phase 9: Edge cases. Status: **to do**

| Case                                              | Behavior to implement                                                                                                |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Storage full (IndexedDB or `localStorage`)        | Visible error, stop appending, offer GPX export of what exists; never silently use memory for an active run          |
| Several queued runs finish syncing together       | One combined "N runs submitted" summary with a list; full result flow only for the newest                            |
| Run older than max age                            | Mark failed with the server's message, offer GPX export + Delete; show `expiresAt` earlier (Phase 6)                 |
| Token expired for more than 7 days                | Outbox keeps the runs (401/403 stays `waiting`); after login the flush resumes; show "Sign in to upload your N runs" |
| Different account logs in on the same phone       | Already scoped by `userId`; list only the signed-in account's runs, keep others untouched                            |
| Device clock changed while offline                | Compare `queuedAtClientMs` with `serverTimeEpochMs` when known; warn before upload if skew is large                  |
| Conquer recorded offline in a non-rolled-out area | Use the last cached rollout result to warn at start: "Territory may not count here"                                  |
| App killed while `uploading`                      | Already handled (resend is idempotent); add a test                                                                   |
| Duplicate tap on Retry/Sync                       | `flushOutbox` already single-flights (`runSync.js:32-44`); add a test                                                |
| Server says duplicate (same `clientRunId`)        | Treated as success (HTTP 200 with the original run)                                                                  |
| Backend lacks a capability                        | Every new field/behavior is gated on the capability response; absent, send today's payload                           |

### Phase 10: Tests

- Unit (Vitest): `runOutbox.js` (enqueue, order, prune, per-user filter, retry), `offlineDb.js`
  (memory fallback, v1 to v2 migration), `classifyError` with `retryable`, GPX builder (golden
  file), expiry calculation, `useRunSync` triggers (online/foreground/backoff timer), the
  incremental active-run writer (append, recover, partial write), payload builder with and
  without capability flags.
- Component: `PendingRunsList` (retry, delete waiting with confirm, export), `ConnectionBanner`
  states, `OfflineRunSavedModal` deadline text.
- E2E (Playwright, mocked GPS, `context.setOffline`): the existing `e2e/offline.spec.js` plus
  kill-and-recover mid-run, queue three runs then reconnect (order preserved, all done),
  permanent failure then Delete and Export GPX, expired-run copy.

---

## 4. Open decisions (your call)

| #   | Decision                                     | Recommendation                                                                                                                                                                      | Default if unanswered     |
| --- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 1   | Is offline **Conquer** allowed at all?       | **Yes.** Record it, let the server decide territory later (it already does; backend rule in BE 3.6, recommended 48 h cap). Show "Territory is decided when it uploads" in the popup | Allowed                   |
| 2   | GPX export                                   | **Yes**, per run in the pending list (also covers storage-full and expired runs)                                                                                                    | Yes                       |
| 3   | Tile caching scope                           | **Option A**: no persistent cache in v1; revisit B after real usage                                                                                                                 | A                         |
| 4   | Storage limits                               | Warn at 50 MB of outbox + active data or when a write fails; keep at most 50 waiting runs; keep failed runs 14 days then offer export + auto-delete after confirm                   | Warn only, no auto-delete |
| 5   | Delete a waiting run                         | Allow with a confirm; never allow deleting `uploading`                                                                                                                              | Allow with confirm        |
| 6   | Show the upload deadline                     | **Yes** ("expires in N days")                                                                                                                                                       | Yes                       |
| 7   | Use the batch endpoint                       | **No** for now; single uploads give per-run results                                                                                                                                 | No                        |
| 8   | Send `Idempotency-Key` header                | **No**; the body `clientRunId` is enough and avoids preflight risk on the native origin                                                                                             | Off                       |
| 9   | Move crash recovery to incremental IndexedDB | **Yes** (Phase 3); it fixes the per-point full rewrite                                                                                                                              | Yes                       |
| 10  | Client minimums (100 m / 30 s)               | Keep for now; revisit once the server's own minimums are decided. Say "client-only" in the UI copy review                                                                           | Keep                      |
| 11  | Add `@capacitor/network`                     | **No**; the probe covers it and a native rebuild is costly                                                                                                                          | No                        |
| 12  | Warn on clock skew                           | **Yes**, once `serverTimeEpochMs` exists (BE 3.10)                                                                                                                                  | Off until then            |

## 5. Order of work

1. Tests for the existing outbox/db/list (Phase 10), because everything below touches them.
2. Phase 3 (incremental crash-safe recording) and Phase 9 storage-full handling.
3. Phase 6 additions (GPX, Sync now, expiry) and Phase 2 banner counts.
4. Phase 5 hardening, shipped behind capability checks as the backend lands BE 3.1-3.13.
5. Phase 8 option A chip; Phase 7 coverage check.

No backend dependency blocks 1 to 3, 5.
