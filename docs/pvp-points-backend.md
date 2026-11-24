# PvP result popup: points / XP (backend request)

For Manoj. Frontend only reads what the server returns, it never computes points.

## 1. Today

The PvP result popup ("You won" / "Good race") shows race time, the VS section and the
Fahhcoins card. It has no points, because the server sends none for PvP.

What exists for normal (territory) runs, `GET /v1/run/{runId}/score-breakdown`:

| Field                                  | Meaning                                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `breakdown.totalScore`                 | run score (area, perimeter, pace, closure, effort)                                                          |
| `breakdown.xp` (`RunXpResultResponse`) | `xpGained`, `xpBefore`, `xpAfter`, `levelBefore`, `levelAfter`, `levelProgressBefore`, `levelProgressAfter` |

For a PvP run, `RunServiceImpl.buildScoreResult` returns only `pvpResult`
(`RunPvpResultResponse`) and never a `breakdown`. So `totalScore` and `xp` are empty.
`RunChallengeServiceImpl.resolveChallenge` only pays the Fahhcoin pot.

## 2. Option A (recommended): reuse the existing XP

Fill the existing `RunXpResultResponse` for the PvP run and return it on `pvpResult`.
It counts toward levels and the XP bar, and the app already knows that shape.

```json
"pvpResult": {
  "challengeId": "...",
  "won": true,
  "...existing fields...": "...",
  "xp": {
    "xpGained": 30,
    "xpBefore": 1200,
    "xpAfter": 1230,
    "levelBefore": 4,
    "levelAfter": 4,
    "levelProgressBefore": 0.40,
    "levelProgressAfter": 0.46
  }
}
```

- `xp` is null/absent until the race is resolved, and the row stays hidden.
- The loser can get XP too (for example a smaller "race" amount), or null for none.
- Mirror it on the resolved challenge, because my own result is fetched before the rival
  finishes: `GET /v1/run-challenge/{id}` and the `pvp-challenge-resolved` push get
  `challengerXpGained` and `opponentXpGained` (Long).

## 3. Option B: separate PvP points (rank/trophy style)

Only if PvP should have its own score, not XP. A signed integer for the requesting player:

```json
"pvpResult": {
  "pointsEarned": 30,
  "pointsWin": 25,
  "pointsRace": 5
}
```

- `pointsEarned` `Integer`: required for the row to appear, negative for a loss, `0` for none.
- `pointsWin` / `pointsRace` `Integer`: optional, give the subtext "Win: +25 / Race: +5".
- Mirror on the resolved challenge: `challengerPointsEarned`, `opponentPointsEarned`
  (optionally `...PointsWin`, `...PointsRace`).

## 4. What the app does with it

- Row "POINTS" between the VS section and the Fahhcoins card, same card style, for winner and loser.
- Big "+N" in green, "-N" in red, "+0" muted. One-line subtext.
- Row hidden when the field is missing, so it is safe to ship the backend first or second.
- Option B is already wired (`pointsOf` in `src/utils/pvpResult.js`).
- Option A (`pvpResult.xp.xpGained`, plus a level-up line) is not wired yet; it is a small frontend
  change once Manoj confirms the shape.

## 5. Questions for Manoj

1. XP (A) or separate points (B)? Recommendation: A.
2. How much does a win give, and does a loss give anything (or take points away in B)?
3. Is the amount shown the same for both players, or does it depend on the stake or distance?
4. Are draws and refunds `+0`?
