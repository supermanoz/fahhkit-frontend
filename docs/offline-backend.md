# Offline runs: what the backend has, what it lacks, what to add

For the backend developer. Audited against `origin/feature/territory-game` (commit `29df113`)
on 2026-11-26. Documentation only: nothing in either repo was changed to produce this.
Paths are under `src/main/java/com/supermanoz/fahhkitsystem/` unless they start with `src/`.

**The short version.** The app already records runs without internet and uploads them later
(IndexedDB outbox, `clientRunId` on every run, one-at-a-time upload with backoff). The backend
already has the core pieces: an idempotent create, a max run age, a time-consistency check, and
a batch endpoint. What is missing is mostly _safety around late and retried runs_: a
retry-safe async processing step, time-zone-safe timestamps, validation of point timestamps and
point counts, a stored "this was late/offline" marker, rate limiting, and a capability
endpoint. Section 3 lists them in priority order.

---

## 1. Current state (what exists today)

### 1.1 Endpoints

| Endpoint                                                                             | Where                                                     | Notes                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/run`                                                                       | `controller/RunController.java:42-55`                     | Body `RunCreateRequest`. Optional header `Idempotency-Key` (max 64 chars) is copied into `clientRunId` only when the body has none (`:45-48`). Holds the response up to `run.score-wait-millis` (default 3000, `:39`) for scoring; slower scoring returns `score.status = PROCESSING`. Always HTTP 200 on success.                                   |
| `POST /v1/run/batch`                                                                 | `RunController.java:57-90`                                | Up to 20 runs (`controller/request/RunBatchRequest.java`, `@Size(max = 20)`). Always HTTP 200 with one result per run, in order: `status` is `OK` (created, or already existed), `FAILED` (permanent) or `RETRY` (temporary). Each run is its own transaction. Scoring is not awaited. **The app does not use it yet** (it sends one run at a time). |
| `GET /v1/run/{id}/score-breakdown`                                                   | `RunController.java:92-96`, `RunServiceImpl.java:341-370` | Returns `status` `PROCESSING` until the async step has written a breakdown, then `READY`.                                                                                                                                                                                                                                                            |
| `GET /v1/run/{id}`, `GET /v1/run/recent`, `POST /v1/run/find`, `DELETE /v1/run/{id}` | `RunController.java:98-120`                               | There is **no lookup by `clientRunId`**.                                                                                                                                                                                                                                                                                                             |
| `POST /v1/auth/refresh`                                                              | `controller/AuthController.java:43`                       | Accepts an expired JWT for up to `jwt.refresh-grace-days` (default 7) past expiry (`util/JwtUtil.java:29-31`, `:76-90`).                                                                                                                                                                                                                             |

### 1.2 Request DTOs

`controller/request/RunCreateRequest.java`: `clientRunId` (`@Size(max = 64)`, `:20-21`), `eventId`,
`challengeId`, `clubWarId`, `mode` (`:34`, optional; only `TERRITORY_CAPTURE` or `TRAINING` may be
requested), `points`, `distance`, `duration` (`@Min(0)`, `:43`), `startedAt`, `endedAt`
(`LocalDateTime`, no offset).

`controller/request/RunPointRequest.java`: `lat` (-90..90), `lng` (-180..180), `timestamp`
(`Long`, epoch ms, `@NotNull`), `accuracy`, `speed`, `elevation`. **No `@Size` limit on the
`points` list.**

Not in the DTO today: `offline`, `appVersion`, `platform`, `queuedAt`/client send time. Unknown JSON
fields are tolerated (Spring Boot default; the only Jackson setting is the time zone, see 1.8).

### 1.3 Validation and idempotency in `createRun`

All in `service/serviceImpl/RunServiceImpl.java`:

| Step              | Line          | Behavior                                                                                                                                                                                                                                                                                                                                       |
| ----------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Idempotent replay | `:121-129`    | If `clientRunId` is set: lock the user row (`userRepository.findByIdForUpdate`), look up `(user, clientRunId)`; if found, return the original run immediately, before any other validation, with no side effects.                                                                                                                              |
| Run times         | `:200-215`    | `RUN_TIME_IN_FUTURE` if start or end is later than now + 10 min (`FUTURE_TIME_TOLERANCE`, `:111`); `RUN_TIMES_INCONSISTENT` if end is before start or `duration` exceeds `end - start` by more than 120 s (`DURATION_TOLERANCE_SECONDS`, `:112`); `RUN_TOO_OLD` if `endedAt` is older than `run.max-submission-age-days` (default 14, `:108`). |
| Mode              | `:217-248`    | See 1.5.                                                                                                                                                                                                                                                                                                                                       |
| Empty points      | `:134-136`    | `EMPTY_POINTS` (not for TRAINING).                                                                                                                                                                                                                                                                                                             |
| Accuracy filter   | `:68,146-152` | Points with `accuracy > 20 m` are dropped before saving; no accuracy = kept. `NO_ACCURATE_POINTS` if none are left (not for TRAINING). The 20 m is a hardcoded constant.                                                                                                                                                                       |
| Save              | `:154-166`    | `Run` row + points in batches of 500 (`POINT_BATCH_SIZE`, `:71`). Point `sequence` is the order received, not sorted by timestamp.                                                                                                                                                                                                             |
| After commit      | `:192`        | Publishes `RunCompletedEvent(runId)`. A replay (1st row) does not publish, so a retried submit never triggers processing twice.                                                                                                                                                                                                                |

Database: `src/main/resources/db/migration/V1_0__schema.sql:395-399`: `client_run_id varchar(64)`,
**`UNIQUE KEY uk_run_user_client_run_id (user_id, client_run_id)`**, `idx_run_user_started_at`.
So the unique index already exists in the baseline schema (confirm it is present in
production, since that database was created with `spring.flyway.baseline-on-migrate=true`).

Error body (`interceptor/ErrorResponseInterceptor.java`): `{ "status", "errorCode", "errorMessage" }`.
Every `BusinessException` is **HTTP 400** (`:19-27`), bean-validation failures are 400 with
`errorCode: "Validation Exception"` (`:31-42`), lock contention is **503** `TEMPORARILY_BUSY` with
`Retry-After: 2` (`:56-64`), anything else is 500 with `exception.getMessage()` (`:66-74`).
There is **no `retryable` field**; the app decides from the HTTP status alone.

### 1.4 Errors a run upload can return (`constant/errorCode/RunErrorCode.java`)

`EMPTY_POINTS`, `NO_ACCURATE_POINTS`, `RUN_NON_EXISTENT`, `RUN_TOO_OLD` (message includes the day
count), `RUN_TIME_IN_FUTURE`, `RUN_TIMES_INCONSISTENT`, `RUN_ALREADY_EXISTS` (event runs),
`EVENT_TYPE_NOT_RUN_LOGGABLE`, `INVALID_RUN_MODE`, `PAID_REGISTRATION_REQUIRED`.

### 1.5 Modes

| Mode                | Chosen at                                      | What happens                                                                                                                                                                                                                                |
| ------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TRAINING`          | `RunServiceImpl.java:132,235` (request `mode`) | No territory processing; distance XP plus pace and base-effort score only (`TerritoryProcessingServiceImpl.java:118-137`). Points may be empty.                                                                                             |
| `TERRITORY_CAPTURE` | `:247` (default)                               | Full pipeline: teleport filter, sustained-speed check, rollout check, loop build, scoring, conflict resolution (`TerritoryProcessingServiceImpl.java:82-217`).                                                                              |
| `PVP`               | `:241` (`challengeId`)                         | `runChallengeService.attachRun` runs inline in `createRun` (`:180-186`); it requires the challenge to be `IN_PROGRESS` (`RunChallengeServiceImpl.java:296`). Territory processing returns early (`TerritoryProcessingServiceImpl.java:86`). |
| `CLUB_WAR`          | `:238` (`clubWarId`)                           | `validateWarRunEligibility` (`ClubWarServiceImpl.java:260-283`): war must be in `BATTLE`, one run per participant, hero lock must match. Uses a pessimistic lock on the participant.                                                        |
| `BOSS_FIGHT`        | `:244`                                         | Event of type `RAID`.                                                                                                                                                                                                                       |

There is **no explicit "offline" rule** for PvP or Club War. A late PvP/war run is accepted if
the challenge/war happens to still be open, and rejected with a 400 otherwise.

### 1.6 Processing, rewards and notifications

- `listener/TerritoryRunCompletionListener.java:7-18`: `@Async` +
  `@TransactionalEventListener(AFTER_COMMIT)` calls `processCompletedRun`. **Any exception is
  only logged** (`:16`): no retry, no dead-letter, no status change. The `@Async` executor
  configuration to check is `config/SchedulingConfig.java:25-26` (core pool size 2, verify it is
  the executor `@Async` uses).
- `processCompletedRun` (`TerritoryProcessingServiceImpl.java:82`) has **no guard against running
  twice for the same run**: it never checks whether a `RunScoreBreakdown` already exists, and
  awards distance XP at `:116` unconditionally. Today that is safe only because it is triggered
  exactly once per created run.
- XP: `territoryXpService.awardDistanceXp` (`:116`), event XP (`:213`). Coins: territory accrual
  runs on its own clock (`TerritoryAccrualProperties`, `territory.accrual.*`, daily cap 50 per
  player); late runs do not touch it except through new parcels' `claimedAt`/`lastCoinAccrualAt`.
- Territory writes use `LocalDateTime.now()` for `claimedAt`, `occurredAt` and accrual clocks
  (`TerritoryConflictResolutionServiceImpl.java:133-134,184-185,214`) and the **currently active
  season** (`:52`), never the run's own time. A run uploaded days late is therefore treated as
  if it happened at upload time.
- Notifications (`TerritoryProcessingServiceImpl.java:222-229`): WebSocket
  `/specific/{userId}` run-processed message (`TerritoryNotificationServiceImpl.java:57-59`),
  territory events on `/specific/{userId}` and `/all/territory` (`:27-35`), and an in-game
  `RUN_RESULT` mail (`:260-265`, data includes `mode`, `status` ACCEPTED/REJECTED,
  `distanceMeters`, `durationSeconds`, `score`, `xpEarned`, `territoriesClaimed`). There is no
  field telling the player the run was late. A device that is offline when the WebSocket message
  is sent misses it; the mail and the score-breakdown poll are what it falls back to.
- Fraud: sustained-speed failure writes `CHEAT_DETECTED` and an automatic fraud flag
  (`:103-112`).

### 1.7 Locking and concurrency

- Same-user submits are serialised by `findByIdForUpdate(user)` at `RunServiceImpl.java:124`
  (only when a `clientRunId` is present), so two parallel retries cannot both pass the lookup.
- Territory resolution locks overlapping parcels (`findByGeomIntersectsForUpdate`,
  `TerritoryConflictResolutionServiceImpl.java:58`).
- Two late runs from one user are processed by independent async tasks, so **their processing
  order is not guaranteed to match their `startedAt` order**.

### 1.8 Limits and time handling

- **Rate limits: none found** (no Bucket4j, no interceptor, no `429` anywhere in `src/main`).
- **Payload limits:** no limit on the number of points; no JSON body limit configured in
  `application.properties` (only multipart: `max-file-size=25MB`, `max-request-size=80MB`, lines
  32-34, not relevant to JSON). A reverse proxy limit (for example nginx
  `client_max_body_size`) is outside this repo; check it. For scale: a point is roughly
  100-150 bytes of JSON (estimate, not measured), so a 1 h run at 1 fix/s is on the order of 400 KB.
- **Time zone:** the server is fixed to `Asia/Kathmandu`
  (`FahhkitSystemApplication.java:40`, `spring.jackson.time-zone`, `hibernate.jdbc.time_zone`,
  `application.properties:4,13`). `startedAt`/`endedAt` are `LocalDateTime` and the app sends the
  **device's local time with no offset** (`toLocalDateTimeString` in the app). The future/age
  checks compare those against the server's Kathmandu `now`. A player whose phone is in another
  time zone is judged wrongly (see 3.2).
- **JWT:** 30-day expiry (`jwt.expiration-days`, `JwtUtil.java:26`), refreshable for 7 days past
  expiry (`jwt.refresh-grace-days`, `:31`). An expired token on a protected endpoint is
  treated as unauthenticated and gets a plain 401/403 from Spring Security (`filter/JwtFilter.java:75-81`).
  The app keeps queued runs through 401/403 and resends after the next login.
- **CORS:** `config/CorsConfig.java:16-17` allows all headers, so `Idempotency-Key` is already
  permitted. (The old note in `docs/offline-runs-backend.md` asking you to add it is out of date.)

---

## 2. Gaps (what the backend lacks to safely accept late, retried runs)

1. **Processing is not retry-safe and not self-healing.** If the async step throws, the run
   stays `PROCESSING` forever and nobody is told (1.6). And the step cannot be safely re-run
   because it has no already-processed guard.
2. **Timestamps are time-zone-unsafe.** Local times without an offset against a fixed
   Kathmandu server clock (1.8).
3. **Point timestamps are never validated.** Not against `startedAt`/`endedAt`, not for order,
   and the saved `sequence` follows arrival order. The anti-cheat treats equal or reversed
   timestamps as violations, but only on the territory path.
4. **No point-count or body-size cap** (1.8).
5. **No record that a run was late or offline.** Nothing stored about receive time versus end
   time, app version, platform, or client send time, so late runs cannot be audited or treated
   differently.
6. **No stated rule for territory and rewards on a late run.** Today the answer is "as of upload
   time, against whatever territory exists now" (1.6), by accident rather than by decision.
   Processing order across a user's backlog is also undefined (1.7).
7. **No explicit PvP/Club War offline rule** (1.5).
8. **No result lookup by `clientRunId`** and no capability/config endpoint (no
   `offlineRunsSupported`, no rule constants, no server time for clock-skew detection).
9. **Error body has no `retryable` flag** and all business errors share HTTP 400, so the app
   infers retry behavior from status codes only.
10. **No rate limit.** A buggy client or a long backlog flush can hammer `POST /v1/run`.
11. **No explicit `Idempotency-Key`/`clientRunId` conflict handling:** a reused `clientRunId`
    with a different body silently returns the original run (acceptable, but undocumented).

---

## 3. Required changes

Effort: **S** under half a day, **M** 1-2 days, **L** 3-5 days. All DB changes are additive
Flyway migrations (use the next free version after the latest in
`src/main/resources/db/migration/`; the filenames below are placeholders).

### 3.1 (Must) Make run processing idempotent and recoverable. Effort: M

**What.** (a) At the top of `processCompletedRun`, return early if a `RunScoreBreakdown` already
exists for the run; back it with a unique index on `run_score_breakdown.run_id`. (b) Add a
scheduled job that finds runs older than `run.processing.stuck-after-minutes` (default 5) with
no breakdown and calls the same method again. (c) Replace the bare `log.error` in the listener
with a `FAILED_PROCESSING` outcome so a permanently failing run stops showing `PROCESSING`.

**Why.** Late and retried runs multiply the chance that processing is interrupted (deploys,
pool exhaustion). Today that leaves a run that never completes and cannot be safely retried.

**Contract.** No API change. `score-breakdown` gains one new status value, `FAILED`, for a run
that exhausted `run.processing.max-attempts` (default 3):

```json
{
  "status": 200,
  "data": {
    "runId": "…",
    "mode": "TERRITORY_CAPTURE",
    "status": "FAILED",
    "breakdown": null
  }
}
```

(Whether an old build keeps polling or stops on an unknown status is **unverified**. The app's
own poll is bounded - see the frontend doc - so a permanent `PROCESSING` ends in a timeout
message there, not an endless spinner.)

**DB.** `ALTER TABLE run_score_breakdown ADD UNIQUE KEY uk_breakdown_run (run_id);` (verify the
current table has no duplicates first) and `ALTER TABLE run ADD COLUMN processing_attempts int
NOT NULL DEFAULT 0;`.

**Config.** `run.processing.stuck-after-minutes=5`, `run.processing.max-attempts=3`,
`run.processing.reaper-interval-seconds=60`.

**Tests.** Calling `processCompletedRun` twice awards XP once; the reaper picks up a run with no
breakdown and finishes it; a run that always throws ends in `FAILED` after the configured
attempts; a run being processed is not picked up twice (row lock or `processing_started_at`).

### 3.2 (Must) Time-zone-safe timestamps. Effort: S-M

**What.** Accept optional `startedAtEpochMs` and `endedAtEpochMs` on `RunCreateRequest`. When
present they win over the `LocalDateTime` fields; the server converts them to its own zone. All
checks in `validateRunTimes` use the converted values. When absent (old apps) behave exactly as
today.

**Why.** Today a phone outside Nepal time can be told its run is "in the future" or "too old".
The app already has epoch values (point timestamps are epoch ms).

**Contract (request, additive):**

```json
{ "clientRunId": "run-3f1c0a52-…", "startedAt": "2026-11-23T07:00:00",
  "endedAt": "2026-11-23T07:15:17", "startedAtEpochMs": 1763857800000,
  "endedAtEpochMs": 1763858717000, "points": [ … ], "distance": 2800, "duration": 917 }
```

**DB.** None (conversion only). **Config.** None.

**Tests.** A run from a UTC+0 device is accepted; the same epoch values as `LocalDateTime`
produce the same stored `startedAt`; epoch values win when they disagree with the string; absent
epoch fields behave as before; "future" and "too old" still trigger at the boundaries.

### 3.3 (Must) Validate point timestamps and cap point count. Effort: M

**What.** Before saving: reject if `points.size() > run.max-points` (default 20000, about 5.5 h at
1 fix/s) with `RUN_TOO_MANY_POINTS`; reject points whose timestamps are not non-decreasing, or
lie outside `[startedAt - run.point-time-slack-seconds, endedAt + run.point-time-slack-seconds]`
(default 300), with `RUN_POINT_TIMES_INVALID`. Sort by timestamp only if you choose to repair
instead of reject (recommended: reject, because anti-cheat is easier to reason about).
Training runs with no points are unaffected.

**Why.** Late uploads are the case where clocks and ordering are most likely to be wrong, and
it is also the cheapest way to stop a client from sending a megabyte of fake points.

**Contract (error, HTTP 400):**

```json
{
  "status": 400,
  "errorCode": "RUN_POINT_TIMES_INVALID",
  "errorMessage": "This run's GPS times don't match its start and end, so it can't be uploaded.",
  "retryable": false
}
```

**Config.** `run.max-points=20000`, `run.point-time-slack-seconds=300`.

**Tests.** 20001 points rejected; reversed timestamps rejected; a point 10 min after `endedAt`
rejected; a point 2 min after accepted; Training with zero points still accepted; both the
single and batch endpoints return the same code.

### 3.4 (Must) Idempotent submit: harden what exists. Effort: S

**What.** The core is in place (1.3). Add: (a) catch `DataIntegrityViolationException` on the
unique key (a race the user-row lock should prevent but a second app instance could expose) and
return the existing run instead of a 500; (b) always lock the user row when `clientRunId` is
set, which it already does, and document that `clientRunId` is unique **per user**; (c) a
repeated `clientRunId` returns the **original** run unchanged even if the body differs, and
logs a warning when `distance`/`startedAt` differ.

**Contract.** Same `POST /v1/run` and `POST /v1/run/batch`. A duplicate returns HTTP 200 with
the original run (as today); never 409 (the app treats any 4xx other than 408/425/429 as a
permanent failure, so a 409 would wrongly mark the run failed).

**DB.** None; the unique index exists (`V1_0__schema.sql:398`).

**Tests.** Two parallel requests with the same `clientRunId` create one run and award XP once
(run it with 20 threads); a retry after commit but before the response returns the same `id`;
a different user with the same `clientRunId` creates a separate run; a replay after the 14-day
max age still returns the original (the replay check runs before the age check, `:121-129`).

### 3.5 (Must) Late-run marker and offline context. Effort: M

**What.** Add optional request fields `offline` (boolean), `appVersion` (string, max 32),
`platform` (`ios|android|web`), `clientSentAtEpochMs` (long). Store them on `run`, plus
`received_at` (server time) and `lateness_seconds` (`received_at - ended_at`). Mark a run `late`
when `lateness_seconds > run.late-threshold-minutes * 60` (default 30). Show it in moderator run
views and in the `RUN_RESULT` mail data (`"late": true`).

**Why.** Without it, nobody can tell which runs came from the offline queue, and the late
territory rule in 3.6 has nothing to key on.

**Contract (request, additive):**

```json
{
  "offline": true,
  "appVersion": "1.0.1",
  "platform": "android",
  "clientSentAtEpochMs": 1763950000000
}
```

**DB (additive):**

```sql
ALTER TABLE run
  ADD COLUMN received_at datetime(6) NULL,
  ADD COLUMN lateness_seconds bigint NULL,
  ADD COLUMN is_late bit(1) NOT NULL DEFAULT b'0',
  ADD COLUMN client_offline bit(1) NULL,
  ADD COLUMN client_app_version varchar(32) NULL,
  ADD COLUMN client_platform varchar(16) NULL,
  ADD COLUMN client_sent_at datetime(6) NULL;
```

**Config.** `run.late-threshold-minutes=30`.

**Tests.** A run ended 2 h ago is `is_late`; an online run is not; missing fields are stored as
null; an old app (no fields) still works; the mail data carries `late`.

### 3.6 (Must, needs your decision) Territory and economy rule for a late run. Effort: M

**What (recommended: option A).** Process a late run against the **current** territory
(as the code does today), but add `territory.late-max-age-hours` (default 48): a run older than
that still earns distance XP and its pace/effort score, but **does not claim or take
territory**; its outcome is a new `LATE_NO_TERRITORY` (alongside `NON_TERRITORY_SCORED`) with the
message "This run was uploaded too late to claim territory." Coins are unaffected (they accrue
on parcels, not runs). Process a user's pending runs **in `startedAt` order**.

**Alternatives.**

| Option          | Behavior                                      | Trade-off                                                                         |
| --------------- | --------------------------------------------- | --------------------------------------------------------------------------------- |
| A (recommended) | Current state; territory only up to 48 h late | Simple; a rival can lose ground to a run that "happened" earlier, bounded to 48 h |
| B               | Always full territory processing (today)      | Simplest, but a 13-day-old run can take land from someone who has held it since   |
| C               | Offline runs never claim territory            | Safest, but the offline feature then only helps Training and XP                   |
| D               | Replay as of the run's end time               | Fairest, but needs time-travel over parcel history; not worth it                  |

**Contract.** Run outcome gains `LATE_NO_TERRITORY` in `RunProcessingOutcomeConstant`; the
`score-breakdown` response carries it and the `RUN_RESULT` mail text says why.

**DB.** The breakdown `outcome` column is an enum/varchar: if it is a MySQL `enum`, extend it
(additive `ALTER … MODIFY`); otherwise nothing. **Config.** `territory.late-max-age-hours=48`.

**Tests.** A run ended 1 h ago claims territory; one ended 3 days ago scores XP but no territory;
two queued runs are processed oldest first; the mail explains the outcome.

### 3.7 (Should) PvP and Club War offline rule. Effort: S

**What.** If a PvP or Club War run is late (3.5) by more than `run.late-versus-max-minutes`
(default 15), reject it with `RUN_TOO_LATE_FOR_MODE` (HTTP 400, `retryable: false`). Training
and Conquer stay allowed. Keeps the existing status checks.

**Why.** Today a late versus run is accepted if the challenge/war is still open, which lets a
player run, wait, and submit only if it went well. **Config.** `run.late-versus-max-minutes=15`.
**Tests.** PvP run uploaded 5 min late accepted, 2 h late rejected; war likewise.

### 3.8 (Should) Result lookup by `clientRunId`. Effort: S

**What.** `GET /v1/run/by-client-id/{clientRunId}` returns the caller's run (same shape as
`POST /v1/run` data, including `score`), or 404 `RUN_NON_EXISTENT`. Scoped to the logged-in
user. Lets the app recover a result after losing the create response, without re-posting.

```json
{ "status": 200, "data": { "id": "…", "startedAt": "2026-11-23T07:00:00",
  "distance": 2800.0, "duration": 917, "avgPace": 5.46,
  "score": { "runId": "…", "mode": "TERRITORY_CAPTURE", "status": "READY", "breakdown": { … } } } }
```

**DB.** None (uses the unique index). **Tests.** Own run found; another user's `clientRunId`
returns 404; unknown id returns 404.

### 3.9 (Should) Async processing contract. Effort: S (documentation) / M (if 202)

**Recommendation: do not change `POST /v1/run` to HTTP 202.** Old apps expect 200 and a `score`
object; the app already copes with `score.status = PROCESSING` and polls
`/v1/run/{id}/score-breakdown`. Keep 200. For the batch endpoint nothing is awaited, so the
client must poll each run's breakdown, which the app does. The WebSocket `/specific/{userId}`
message and the `RUN_RESULT` mail remain the "it finished" signals; add a push notification for
late runs (3.11). Default if you disagree: keep 200.

### 3.10 (Should) Capability and rules endpoint. Effort: S

**What.** A public, cacheable `GET /v1/config/client` (or fold into the `GET
/v1/territory/rules` proposed in `docs/territory-rules-backend-ask.md`):

```json
{
  "offlineRunsSupported": true,
  "serverTimeEpochMs": 1763950000000,
  "run": {
    "maxAgeDays": 14,
    "maxPoints": 20000,
    "maxBatchSize": 20,
    "pointTimeSlackSeconds": 300,
    "lateThresholdMinutes": 30,
    "idempotencyHeader": "Idempotency-Key"
  },
  "territory": {
    "closureThresholdMeters": 25.0,
    "minEnclosedAreaSqMeters": 2000.0,
    "minPoints": 10,
    "lateMaxAgeHours": 48
  },
  "supportsEpochTimestamps": true
}
```

**Why.** The app can degrade gracefully (for example only send the new fields when
`supportsEpochTimestamps`), show the real maximum age, and detect device clock skew from
`serverTimeEpochMs`. Read the values from the same `@Value`/`@ConfigurationProperties` the code
uses so the endpoint cannot disagree with it. **Tests.** Values equal the configured
properties; an override via env changes the response.

### 3.11 (Should) Notifications and mail for outcomes. Effort: S-M

The `RUN_RESULT` mail already exists for every processed run (`TerritoryProcessingServiceImpl.java:260-265`).
Add: `late` in its data (3.5); mail for `FAILED_PROCESSING` and `LATE_NO_TERRITORY` outcomes; and,
if a push sender exists in the backend (verify, the app registers for push), one push per
late run when it finishes processing: "Your offline run from Tue 7:00 was counted". Never one
push per point of a batch: one per run, collapsed if more than 3 in a minute.

### 3.12 (Should) Rate limiting. Effort: M

**What.** Per-user limit on `POST /v1/run` and `/v1/run/batch`: default 30 requests per
minute per user (`run.rate-limit.per-minute`), HTTP **429** with `Retry-After` and the standard
error body (`"retryable": true`). The app already treats 429 as retryable with exponential
backoff (5 s to 5 min), so this is safe to add. Batch counts one request per call.

**Tests.** The 31st request in a minute gets 429 with `Retry-After`; the limit is per user, not
global; a replayed `clientRunId` does not consume extra database work beyond the lookup.

### 3.13 (Should) Error body with `retryable`. Effort: S

Add `"retryable": true|false` to `ErrorResponse` (`ErrorResponseInterceptor`): `true` for 503
`TEMPORARILY_BUSY`, 429, and `TEMPORARY_FAILURE`; `false` for every `BusinessException`. Keep
`status`, `errorCode`, `errorMessage` unchanged (old apps ignore the new field). Final shape:

```json
{
  "status": 503,
  "errorCode": "TEMPORARILY_BUSY",
  "errorMessage": "The server was busy handling another request. Please try again in a moment.",
  "retryable": true
}
```

Also stop returning `exception.getMessage()` in the 500 handler for run endpoints (it can leak
internals); return a fixed player-readable message.

### 3.14 (Nice) Batch endpoint

**Recommendation: keep it, change nothing, and do not require it.** It already exists and
behaves as the app needs (per-run `OK/FAILED/RETRY`, max 20, ordered). The app sends one run at
a time because that keeps the "oldest first, stop on a retryable error" logic simple and makes
the per-run result popup possible. Switch the app to batch only if players routinely come back
with many runs. If it is used, add `awaitRunScore` off by default (as now) and the same
validation as 3.1-3.6. Default: leave as is.

### 3.15 (Nice) Clock skew record. Effort: S

Store `clientSentAtEpochMs` (3.5) and log `skew = server receive time - clientSentAt`. Do not
adjust times from it; only flag runs where `|skew| > run.max-clock-skew-minutes` (default 60)
for moderator review.

---

## 4. Old-app backward compatibility

Every change above is additive: new optional request fields, new optional response values, one
new `score-breakdown` status and one new outcome. Old apps that send none of the new fields keep
today's behavior (3.2 and 3.5 fall back; 3.3 and 3.6 apply to them too, which is intended). The
one thing to check is how old builds react to the new `FAILED` status in 3.1 (they should keep
polling and then give up at their poll cap).

## 5. Rollout and rollback order

1. Ship migrations first (3.1 unique index after a duplicate check, 3.5 columns). They are
   additive and safe with the old code running.
2. Deploy the backend with every new check behind a config flag (`run.validation.point-times.enabled`,
   `territory.late-rules.enabled`, `run.rate-limit.enabled`), all **off**.
3. Verify with the curl examples below on `fahhkit-test`, then turn flags on one at a time:
   rate limit, point validation, late rules.
4. Then ship the app version that sends the new fields (it can detect support from 3.10).
5. Rollback: flip the flags off. Migrations are additive and stay. Do not drop columns.

## 6. Verification (curl)

```bash
BASE=https://cafebizarre.com.np/fahhkit-test
TOKEN=<a test user's JWT>      # do not paste real tokens into tickets

# 1. Create a run (idempotent). Run it twice: both must return the same data.id.
curl -s -X POST "$BASE/v1/run" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"clientRunId":"run-test-0001","mode":"TRAINING","distance":1200,"duration":420,
       "startedAt":"2026-11-23T07:00:00","endedAt":"2026-11-23T07:07:00","points":[]}'

# 2. Same key as a header only (body has no clientRunId).
curl -s -X POST "$BASE/v1/run" -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: run-test-0002" \
  -H "Content-Type: application/json" \
  -d '{"mode":"TRAINING","distance":1200,"duration":420,"startedAt":"2026-11-23T07:00:00","endedAt":"2026-11-23T07:07:00","points":[]}'

# 3. Too old (older than run.max-submission-age-days): expect 400 RUN_TOO_OLD.
curl -s -i -X POST "$BASE/v1/run" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"clientRunId":"run-test-old","mode":"TRAINING","distance":1000,"duration":300,
       "startedAt":"2026-01-01T07:00:00","endedAt":"2026-01-01T07:05:00","points":[]}'

# 4. Future time: expect 400 RUN_TIME_IN_FUTURE.
curl -s -i -X POST "$BASE/v1/run" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"clientRunId":"run-test-future","mode":"TRAINING","distance":1000,"duration":300,
       "startedAt":"2030-01-01T07:00:00","endedAt":"2030-01-01T07:05:00","points":[]}'

# 5. Batch of two (one good, one bad): HTTP 200, per-item OK / FAILED.
curl -s -X POST "$BASE/v1/run/batch" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"runs":[{"clientRunId":"run-b1","mode":"TRAINING","distance":900,"duration":300,
                "startedAt":"2026-11-23T07:00:00","endedAt":"2026-11-23T07:05:00","points":[]},
               {"clientRunId":"run-b2","mode":"TRAINING","distance":900,"duration":300,
                "startedAt":"2030-01-01T07:00:00","endedAt":"2030-01-01T07:05:00","points":[]}]}'

# 6. Score / processing status.
curl -s "$BASE/v1/run/<runId>/score-breakdown" -H "Authorization: Bearer $TOKEN"

# 7. After 3.8 is built: look a run up by its client id.
curl -s "$BASE/v1/run/by-client-id/run-test-0001" -H "Authorization: Bearer $TOKEN"

# 8. After 3.10 is built: capabilities.
curl -s "$BASE/v1/config/client"
```

A Conquer (`TERRITORY_CAPTURE`) test needs a real track (at least 10 GPS points, within 15 km of
an enabled city); use the sample tracks in `src/game/territoryFixtures.json` in the frontend repo.

## 7. Priority and effort

| #    | Item                                   | Priority            | Effort |
| ---- | -------------------------------------- | ------------------- | ------ |
| 3.1  | Idempotent, recoverable processing     | **Must**            | M      |
| 3.2  | Time-zone-safe timestamps              | **Must**            | S-M    |
| 3.3  | Point timestamp validation, point cap  | **Must**            | M      |
| 3.4  | Harden idempotent submit               | **Must**            | S      |
| 3.5  | Late/offline marker and context fields | **Must**            | M      |
| 3.6  | Late territory/economy rule            | **Must** (decision) | M      |
| 3.7  | PvP/Club War offline rule              | Should              | S      |
| 3.8  | Lookup by `clientRunId`                | Should              | S      |
| 3.9  | Async contract (keep 200)              | Should              | S      |
| 3.10 | Capability/rules endpoint              | Should              | S      |
| 3.11 | Mail/notification for outcomes         | Should              | S-M    |
| 3.12 | Rate limiting with 429                 | Should              | M      |
| 3.13 | `retryable` in error body              | Should              | S      |
| 3.14 | Batch endpoint                         | Nice (keep as is)   | none   |
| 3.15 | Clock skew record                      | Nice                | S      |

"Must" means the app's offline queue is only safe in production once it is done. The queue is
**already in the app** (it uses 3.4's existing behavior), so 3.1-3.6 are the gap between "works"
and "safe". Rough total for the Must items: 8-12 working days.

## 8. Open decisions (your call)

| #   | Decision                         | Recommendation                                              | Trade-off                                                                                                                  | Default if unanswered |
| --- | -------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1   | Max run age                      | Keep **14 days** (`run.max-submission-age-days`)            | Longer means more stale territory claims; shorter loses honest offline runs. 14 d fits the 30 d JWT plus 7 d refresh grace | 14                    |
| 2   | Territory rule for late runs     | **Option A**: current state, territory only up to 48 h late | See the table in 3.6                                                                                                       | A with 48 h           |
| 3   | Batch endpoint                   | **Keep, don't extend, don't require**                       | Single uploads keep per-run results simple                                                                                 | Leave as is           |
| 4   | `POST /v1/run` returning 202     | **No**, keep 200 + `PROCESSING`                             | 202 breaks old apps                                                                                                        | Keep 200              |
| 5   | Reject or repair bad point order | **Reject** (`RUN_POINT_TIMES_INVALID`)                      | Repairing hides bad clients                                                                                                | Reject                |
| 6   | Max points per run               | **20000**                                                   | Longer than 5.5 h at 1 fix/s needs more                                                                                    | 20000                 |
| 7   | Rate limit                       | **30/min per user**                                         | Too low breaks a big backlog flush                                                                                         | 30/min                |
| 8   | PvP/war late limit               | **15 min**                                                  | Stricter is fairer; looser helps flaky signal                                                                              | 15 min                |
| 9   | Timestamps                       | **Add epoch fields**, keep the strings                      | One more field to maintain                                                                                                 | Add                   |
| 10  | Late threshold ("late" flag)     | **30 min**                                                  | Only affects labeling and 3.6/3.7                                                                                          | 30 min                |
| 11  | Push for late runs               | **Yes, one per run, collapsed**                             | Needs the push sender                                                                                                      | Mail only             |

## 9. Tests to write (summary)

Idempotency under 20 parallel identical requests (one run, XP once); replay after max age;
processing twice awards once; reaper recovers a stuck run; `FAILED` after max attempts; epoch
timestamps from a UTC+0 phone; point-order and slack validation; 20001 points; late flag and
`LATE_NO_TERRITORY`; queued runs processed oldest first; PvP/war late rejection; lookup by
`clientRunId` (own vs another user); rate limit 429 with `Retry-After`; error body `retryable`;
`/v1/config/client` equals the configured properties; old-app request (no new fields) still
returns 200 with unchanged shape. The shared territory fixtures
(`src/game/territoryFixtures.json`, backend branch `test/territory-rule-fixtures`) cover the
Conquer rules; run that test first, it has never been executed.

## 10. Out of date elsewhere

`docs/offline-runs-backend.md` (frontend repo) predates this audit: it says the batch response is
`{results:[{status:CREATED|DUPLICATE|REJECTED}]}` (the real one is a list of
`OK|FAILED|RETRY`), that `Idempotency-Key` needs a CORS change (it does not) and that max age
and clock checks are still to be built (they exist). Use this file instead.
