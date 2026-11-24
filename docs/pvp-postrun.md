# PvP post-run flow - audit, new flow, backend asks

## 1. Audit (before)

PvP is a **race**, not a score: both runners cover the same distance, the faster _race time_ wins the
pot (stake x 2). Hero perks can shave race time. So the popup shows **race time**, not a "run score",
and the coin outcome is the **stake payout**, not earned coins.

| Step           | Where                                                                                                                                              | What happened                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Run ends       | `GamePage.jsx` auto-finish effect (race distance reached) or End -> "Yes, End" -> draft with **Submit Run**                                        | Auto-finish submitted by itself; a manual End needed an extra Submit tap                    |
| Submit         | `attemptSubmit` -> `createRun` (`POST /v1/run`, `challengeId`)                                                                                     | Blank map until the response; no "submitting" UI for auto-finish                            |
| Own result     | server judges my side **synchronously** inside the POST (`RunChallengeServiceImpl.attachRun`)                                                      | The app **never asked** for it: `GET /v1/run/{id}/score-breakdown` (`pvpResult`) was unused |
| Result popup   | `RunResultCard` "Run submitted! Race time logged. Waiting for your rival - check the PvP tab" + `RunRewardsModal` "PvP Result" ("No XP this time") | Generic, no race time, no result                                                            |
| Rival finishes | STOMP `/specific/{me}/pvp-challenge-resolved` -> `usePvp.handlePush` -> top pill "Race results are in"                                             | Only a pill; the real result was inside the PvP tab                                         |
| Fallback       | PvP-tab polling (`findMyChallenges`) every 5-20 s, **only while the PvP tab is open**                                                              | Closed tab + dead socket = no result until reopened                                         |
| Error          | `saveError` modal "Couldn't save that run" + Retry Save                                                                                            | OK, but separate from PvP                                                                   |
| Offline        | outbox ("Run saved")                                                                                                                               | Fine, but no PvP wording                                                                    |
| Opponent       | when ONE side finishes the other gets **nothing** (backend only notifies on resolve/forfeit)                                                       | see asks                                                                                    |

Data we get: own `raceTimeSeconds`, `runValid`/`invalidReason`, `heroBonus`, `opponentSubmitted`,
`opponentRaceTimeSeconds` (once the rival is in), `won`, `resolutionType`
(WIN_BY_TIME / WIN_BY_FORFEIT / TIE_REFUND / MUTUAL_FORFEIT_REFUND); challenge: `stakeAmount`,
`winnerId`. **No XP, no coins-earned and no new balance** in any PvP payload.
Latency: own result = the POST itself (~1 request); the rival's result = whenever they finish
(minutes) -> socket push, then `AFTER_COMMIT` resolution.

## 2. New flow (what was built)

- `components/PvpResultPopup.jsx` - one popup that grows with the news: **Calculating...** (skeleton)
  -> **race time counts up** -> **Waiting for {rival}** (live dot; Done works, nothing is blocked)
  -> **You won! / Good race / It's a tie** with both times side by side -> **Fahhcoins**:
  coins fly into the HUD, balance counts up old -> new. Tap anywhere skips. Reduced motion = static.
- `hooks/usePvpPostRun.js` - follows ONE run: own result (`getRunScore`, retried with backoff) ->
  rival via the socket push, with `getChallenge` polling (3 s -> 15 s backoff) as fallback ->
  on resolve re-reads my result + the wallet (`refreshProfile`).
- `utils/pvpResult.js` (+ tests) - outcome/view model, backoff, "seen" bookkeeping.
- Both entries submit by themselves now (auto-finish and manual End).
- > 15 s without my own result: "Still processing - we'll let you know". Closing the popup keeps
  > following in the background and **re-opens it with the result** when it lands.
- Coins are only the server's wallet difference (balance before the race resolved vs the balance the
  server reports after). Nothing is computed from the stake. Loss/draw copy is calm ("Good race").
- Idempotent: the final result animates once per race (`fahhkit_pvp_seen_<challengeId>`); a
  duplicate socket event or poll changes nothing; the session survives an app kill and re-opens
  once; a retry re-sends the same `clientRunId`.
- Offline: the run goes to the outbox and the PvP popup says PvP needs internet.
- "Rematch" was not added (no such feature exists).

## 3. Backend asks (Manoj)

1. **Opponent notification when the FIRST runner submits.** Today nobody is told. Send a socket event
   (`/specific/{opponentId}/pvp-opponent-finished`, payload = `RunChallengeResponse`) so the other
   player gets a toast ("Aarav finished - your turn") and the app can show a live "rival is done" state.
2. **Push notification category for PvP** (FCM): `PVP_OPPONENT_FINISHED` and `PVP_RESULT` ("Race
   results are in") - none exists in `push/FcmPushSender`. Needed so a closed app is notified.
3. **Put the payout in the result**, so the client never infers it: add to `RunChallengeResponse` /
   `RunPvpResultResponse`: `payoutAmount` (coins credited to ME, 0 on a loss, refund on tie),
   `newBalance` (my wallet after resolution), and both race times
   (`challengerRaceTimeSeconds` / `opponentRaceTimeSeconds`) on the **resolved socket event**, so the
   popup needs no extra round trips.
4. **XP / rewards for PvP**: say whether a race grants XP; if yes include `xpEarned` in `pvpResult`.
5. **Polling endpoint**: `GET /v1/run-challenge/{id}` is what the app polls; please confirm it is cheap,
   allowed for both participants, and returns `resolutionType` + `winnerId` once resolved (it does today).
6. **Mail on result**: put a mailbox entry ("Race results are in") for the loser too on resolve
   (today only forfeits create mail), so the result is visible in Mail if the popup was missed.
7. Keep `/v1/run` idempotent on `clientRunId` (also see `offline-runs-backend.md`).

## 4. Rival hero + nickname (Next Rival card) - backend ask for Manoj

Checked on `origin/feature/territory-game`: **no PvP response carries the opponent's hero or nickname.**
`RunChallengeResponse`, `NearbyPlayerResponse` and `MatchmakingQueueEntryResponse` have only
`challengerName` / `opponentName` / `fullName`. `UserPublicProfileResponse` has a nickname but no hero.
The app already reads the fields below if they appear (nothing else to change on the app side):

| Response                        | Add                                                                                                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RunChallengeResponse`          | `challengerNickname`, `opponentNickname`, `challengerHeroId`, `opponentHeroId`, `challengerHeroName`, `opponentHeroName`, `challengerHeroColor`, `opponentHeroColor` |
| `NearbyPlayerResponse`          | `nickname`, `heroId`, `heroName`, `heroColor`                                                                                                                        |
| `MatchmakingQueueEntryResponse` | `opponentNickname`, `opponentHeroId`, `opponentHeroName`, `opponentHeroColor`                                                                                        |

- hero = the hero the player has **equipped** (store item `heroId`, plus its name). The app matches id, then name.
- `heroColor`: the app has no colour-variant system today (hero art is one fixed look per hero), so it is
  carried on the element (`data-hero-color`) but not applied. Say what "color" means (a skin store item? a hue?)
  before it is built.
- Until these exist the card shows the rival's photo/initial, exactly as before.

### How to fill them (backend)

- Source: the player's equipped items - `UserStoreItem` with `equipped = true`
  (same data as `GET /v1/store/equipped`, `UserStoreItemRepository.findByUserAndEquippedTrue`).
  `heroId` / `heroName` = the equipped **HERO** item's `hero.id` / `hero.name`
  (an equipped SKIN's `assetUrl` can be added as `heroSkinUrl` later).
  Precedent: `TerritoryParcelResponse.ownerEquippedItems`.
- **Batch it**: one query for all users on a page (`... WHERE user IN (:users) AND equipped = true`,
  fetching `storeItem` + `hero`), never one query per challenge / nearby player.
- Null-safe: nothing equipped -> leave the hero fields null (the app then shows its default hero).
- Only added fields - no existing field changes, so older app versions keep working.
- No change to the frontend is needed once the fields exist (names above are what it reads).

### Update: no backend change is required for the hero

The app now reads the rival's equipped hero from their **public territory profile**
(`GET /v1/territory/profile/{userId}` -> `equippedCosmetics`, the same data the profile panel
shows), one cached request per rival (max 12). The fields above are now only an optimisation
(they would save those extra requests and add the nickname); the hero works without them.

## 5. Points on the result popup ("POINTS" row) - backend ask

**Audit (origin/feature/territory-game):** the server awards **no points of any kind for PvP**.
`RunChallengeServiceImpl.resolveChallenge` only does `applyPayout` (Fahhcoins pot) and sends
mails/pushes; `RunPvpResultResponse` and `RunChallengeResponse` carry no XP / rank / trophy /
season value. XP (`TerritoryXpService.awardFlatXp`) is only given for territory runs and Club
War wins; seasons/leaderboards are territory-based. So there is nothing for the app to show
today and it does not invent or compute anything.

**What Manoj needs to add** (signed integer, the points THIS player gained or lost; `0` when none):

`GET /v1/run/{runId}/score-breakdown` -> `pvpResult` (my side):

```json
"pvpResult": {
  "...existing fields...": "...",
  "pointsEarned": 30,
  "pointsWin": 25,
  "pointsRace": 5
}
```

- `pointsEarned` `Integer` - required for the row to appear; negative for a loss.
- `pointsWin` / `pointsRace` `Integer` - optional; when BOTH are present the subtext reads
  "Win: +25 / Race: +5", otherwise it just says "Race won" / "Race lost".
- Null / absent until the race is resolved -> the row stays hidden.

Because my result is fetched before the rival finishes, also mirror it on the resolved
challenge (`GET /v1/run-challenge/{id}` and the `pvp-challenge-resolved` push):
`challengerPointsEarned`, `opponentPointsEarned` (and optionally `...PointsWin`, `...PointsRace`).

The app reads either place automatically (`pointsOf` in `src/utils/pvpResult.js`); no
frontend change is needed once the fields exist.
