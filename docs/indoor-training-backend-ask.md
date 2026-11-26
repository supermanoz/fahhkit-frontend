# Indoor (treadmill) Training + steps: what the backend needs

Checked on `feature/territory-game`. The frontend sends these today; the server ignores the ones it has no field for.

## What works as-is

- `POST /v1/run` with `mode: "TRAINING"` and `points: []` is accepted (`RunServiceImpl.createRun`; `distance` + `duration` required, `duration <= end - start + 120 s`).
- Territory is skipped for TRAINING (`TerritoryProcessingServiceImpl`): no loop, no capture, no PvP stake.

## Now on the backend (b0122c6)

- `steps` is accepted, dropped when implausible (> 300/min + 50), stored, and returned in the summary/detail. The app shows it.
- Epoch times, `offline`, `appVersion`, `platform`, `clientSentAtEpochMs`, late-run marking and point-time validation (points skip validation when empty, so indoor is unaffected).

## Still missing

1. **No `indoor` flag** (nor `distanceSource` / `stepsSource`): the app sends them, the server ignores them. History marks indoor runs from a local id list and "no points" on the detail view.
2. **No plausibility rules for a run without points.** Suggested for `TRAINING` + empty points: pace 2:30-20:00 min/km, duration <= 4 h, distance >= 100 m, stride (distance/steps) 0.4-1.6 m when steps exist.
3. **Reward caps for self-reported distance** (below).

## What Training rewards today (and the farming risk)

- **XP:** `awardDistanceXp` = km x `territory.xp.xp-per-km` (10), **no cap**, for any run that passes the speed check. With no points the speed check has nothing to check, so a typed distance is paid in full: 4 h at 2:30/km would be 96 km = 960 XP.
- **Score:** `computeLoopIndependentComponents` = pace band score x 20 + min(km, 10) x 2. Pace 4:00-12:00 /km scores full, so typing a pace in that band maxes it. Capped by `max-base-effort-km` (10), so score is bounded.
- **Coins / leaderboard / missions / streaks:** training run mail and score breakdown only; no coin grant, no territory leaderboard, no PvP stake in this path. Daily-login streak is independent of runs. Event/RAID leaderboards need `eventId`, which TRAINING rejects. `sumTotalDistance` (global km counter) **does** include indoor distance.
- **Risks:** unbounded self-reported XP; inflated global km; no per-day limit.
- **Suggested caps for Manoj:** indoor XP only for the first ~10 km/day and ~3 indoor runs/day (or 50% XP rate); exclude indoor from `sumTotalDistance`; cap indoor distance by the pace/duration rules above server-side; flag runs whose steps contradict the distance.

## Play Store / App Store notes

- Android: `ACTIVITY_RECOGNITION` runtime permission (declared in the manifest). Data safety: declare "Fitness info -> steps" if steps are sent to the server (they are, with the run). Health-apps declaration may apply.
- iOS: `NSMotionUsageDescription` updated. CMPedometer uses no required-reason API, so no `PrivacyInfo.xcprivacy` change was needed (plugin is in-app, covered by the app's manifest). App Privacy label: Health & Fitness -> Fitness (steps) if sent to the server.
