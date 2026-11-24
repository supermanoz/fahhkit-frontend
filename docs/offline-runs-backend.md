# Offline runs - backend contract

For Manoj. The app now records runs with no internet and uploads them later (minutes,
hours or days after the run). It keeps using the **current** endpoint, `POST /v1/run`. The
items below are what the backend must guarantee, plus what is optional.

## What the app sends today (no backend change needed to start)

`POST /v1/run` with the usual body plus an idempotency key:

```json
{
  "eventId": null,
  "points": [
    {
      "lat": 27.71,
      "lng": 85.32,
      "timestamp": 1730000000000,
      "accuracy": 5,
      "...": "..."
    }
  ],
  "distance": 2800,
  "duration": 917,
  "startedAt": "2026-11-23T07:00:00",
  "endedAt": "2026-11-23T07:15:17",
  "challengeId": null,
  "clubWarId": null,
  "clientRunId": "run-3f1c0a52-9b9a-4c52-8a8e-0d1d6a3c2b11"
}
```

- `clientRunId` is created **once at run start** and never changes, so every retry carries
  the same id. Format: `run-<uuid>` (older in-flight runs may still be `run-<startedAt ms>`).
  Max length needed: 40 chars.
- Optional header `Idempotency-Key: <clientRunId>`. **Off by default** (`VITE_IDEMPOTENCY_HEADER=true`
  turns it on) because a new request header must be added to the CORS allow-list first, or every
  run submit fails its preflight. Please add `Idempotency-Key` to `Access-Control-Allow-Headers`
  when convenient; the body field is the source of truth either way.

## Must-haves

1. **Idempotent create.** Same `(userId, clientRunId)` -> return the **same** run (same `id`, `avgPace`,
   200/201 either way), create nothing new, award **no second XP/coins/territory**. This is
   what makes "the connection died after the server saved it" and app-kill-mid-upload safe.
   (The existing comment says the id is already scoped per user - confirm it also holds for
   rewards and the territory pipeline, not just the `run` row.)
2. **Accept the past.** `startedAt`, `endedAt` and every point `timestamp` can be hours/days
   old. Do not reject a run because its times are not "now". Process it like a normal run
   (territory events, XP, club-war/PvP scoring where applicable).
3. **Never trust the client for economy/territory.** Distance, pace, loop closure, XP, coins and
   territory are recomputed from the points server-side, as today. Run the full anti-cheat
   (speed, teleport, vehicle, accuracy) on late submissions exactly like live ones.
4. **Max age.** Reject runs older than N days (suggest 14; make it a property). Answer with the
   permanent error below so the app marks it failed with a readable reason instead of retrying.
5. **Territory may have changed.** The server decides on current state at processing time (a
   rival may have taken the ground while the player was offline). The run still counts for XP;
   the territory result is whatever the pipeline produces now. The app shows the real result
   (via the normal `/specific/{userId}` push or the territory-event poll), never a guess.
6. **Clock sanity.** The app sends `startedAt/endedAt` from the device clock. Compare against
   server receive time: a run that ends in the future, or whose duration disagrees with its
   point timestamps, is rejected as invalid. (A device clock changed while offline is the
   expected cause; the app also stores `queuedAtClientMs` in its local metadata and can send it
   if you want it - say so.)
7. **Per-user cap.** Protect the endpoint from a player flushing a huge backlog: the app sends
   one run at a time, oldest first, so a normal per-user rate limit is fine - but answer
   **429** (not 4xx-permanent) when you throttle.

## Error codes the client relies on

| Status                                | App treats it as | Result                                                                                                                     |
| ------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| network error / timeout               | not a failure    | stays _waiting_, retried when online                                                                                       |
| 2xx                                   | accepted         | _done_, shows normal XP/territory results                                                                                  |
| 401 / 403                             | session problem  | stays _waiting_ (no penalty, never dropped), sent after next login                                                         |
| 408, 425, 429, 5xx                    | retryable        | stays _waiting_, exponential backoff 5s -> 5min                                                                            |
| any other 4xx (400, 409, 413, 422...) | **permanent**    | _failed_; `errorMessage` from the response body is shown to the player; no automatic retry; the player can Retry or Delete |

Keep using the existing envelope: `{"errorMessage": "..."}` on errors. Please make the message
player-readable ("This run is too old to count", "Run rejected: ...") - it is shown verbatim.
**Do not** return 409 for "already created" - return the existing run with 200 (rule 1); 409
would mark the run failed on the device.

## Optional: batch endpoint

`POST /v1/run/batch` `{ "runs": [ <run body>, ... ] }` -> `{ "results": [ { "clientRunId", "status": "CREATED|DUPLICATE|REJECTED", "run": {...}, "errorMessage" } ] }`.
Same per-run rules (idempotent, ordered, per-run errors). Only worth it if players routinely
queue many runs; the app does not need it and sends one at a time today.

## What needs you (Manoj)

- [ ] Confirm/enable full idempotency incl. rewards (rule 1) on `clientRunId`.
- [ ] Late-submission policy: max age, clock/future checks (rules 2, 4, 6).
- [ ] CORS: allow `Idempotency-Key` request header (then set `VITE_IDEMPOTENCY_HEADER=true`).
- [ ] Player-readable `errorMessage` for rejections.
- [ ] (optional) batch endpoint.
