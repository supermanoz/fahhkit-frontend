# Daily reward (7-day login streak) — backend contract

For Manoj. The frontend (`src/api/dailyReward.js`, `DailyRewardModal`) is built against
this contract. **The server decides everything**; the client only renders what it is told
and never computes eligibility, streak or rewards.

## What exists today (`feature/territory-game`, commit `d99c59c`)

| Piece                                                                | State                                                                                               |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `POST /v1/daily-login/redeem`                                        | flat reward, once per **calendar day** (server-local midnight)                                      |
| `DailyLoginProperties`                                               | `daily-login.reward-fahhcoin=5` (one number)                                                        |
| Ledger                                                               | `FahhcoinTransactionType.DAILY_LOGIN_REWARD`, double-credit stopped by the wallet's optimistic lock |
| Response                                                             | `{ rewardedFahhcoin, balance }`                                                                     |
| Error                                                                | `DAILY_LOGIN_ALREADY_REDEEMED`                                                                      |
| Status endpoint, streak, 7-day cycle, XP/item rewards, 24h/48h rules | **none**                                                                                            |

Everything below extends that; keep the ledger type and the wallet credit path.

## Rules

- `lastClaimAt` per user (UTC instant). **Server clock only.**
- **Claimable** when `now >= lastClaimAt + 24h` (or the user has never claimed). This is a
  rolling 24h window, _not_ calendar midnight.
- **Streak** continues if the claim happens within **48h** of `lastClaimAt`
  (`now < lastClaimAt + 48h`): `streak = streak + 1`. Later than that: `streak = 1`
  (reset to day 1). First ever claim: `streak = 1`.
- **Cycle day** `dayIndex = ((streak - 1) % 7) + 1`. Day 7 is the big reward; day 8 is day 1
  again (the streak number keeps counting, the cycle wraps).
- **Rewards come from server config**, never hardcoded in the app (see below). Reuse the
  existing economy: Fahhcoin through `FahhcoinWalletService.credit(...)`, XP through the
  existing XP service, an optional item through the existing `STORE_ITEM_GRANT` path.
- **Claim is atomic and idempotent.** In one transaction: lock the user's
  `daily_login_state` row (`SELECT … FOR UPDATE`, or `@Version` + retry), re-check
  eligibility, update `lastClaimAt/streak`, credit wallet / XP / item. A double-tap, a
  retry after a timeout, or two devices at once must never grant twice: the second
  request finds the row already advanced and returns `DAILY_LOGIN_ALREADY_REDEEMED`.
  (Optionally also accept an `Idempotency-Key` header; not required by the app.)

## Endpoints

All under `/v1/daily-login`, authenticated, wrapped in the usual
`GeneralResponse { status, data }`.

### `GET /v1/daily-login/status`

```json
{
  "claimable": true,
  "nextClaimAt": null,
  "streak": 3,
  "todayIndex": 4,
  "rewards": [
    { "day": 1, "coins": 5, "xp": 0, "item": null },
    { "day": 2, "coins": 10, "xp": 0, "item": null },
    { "day": 3, "coins": 15, "xp": 50, "item": null },
    { "day": 4, "coins": 20, "xp": 0, "item": null },
    { "day": 5, "coins": 25, "xp": 100, "item": null },
    { "day": 6, "coins": 30, "xp": 0, "item": null },
    {
      "day": 7,
      "coins": 100,
      "xp": 250,
      "item": {
        "id": 41,
        "name": "Golden Trail",
        "imageUrl": "/files/store/golden-trail.png"
      }
    }
  ],
  "serverTime": "2026-11-23T08:00:00Z"
}
```

| Field         | Meaning                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `claimable`   | server says a claim would succeed right now                                                                                                            |
| `nextClaimAt` | ISO instant the next claim opens (`lastClaimAt + 24h`); `null` when `claimable` is true                                                                |
| `streak`      | current chain length **as of now**. If the chain is already broken (`now >= lastClaimAt + 48h`) report `0`, so the UI shows the reset before the claim |
| `todayIndex`  | 1..7. When `claimable`: the cycle day this claim will grant. When not: the cycle day claimed most recently (the UI shows it as ✓ and counts down)      |
| `rewards`     | exactly 7 entries, `day` 1..7, from server config. `coins` / `xp` may be 0, `item` may be `null`; at least one must be non-zero/non-null               |
| `serverTime`  | the server's now; the app uses it to correct the countdown for clock skew (display only, the server still decides on claim)                            |

### `POST /v1/daily-login/claim`

Empty body. Success:

```json
{
  "granted": { "day": 4, "coins": 20, "xp": 0, "item": null },
  "streak": 4,
  "todayIndex": 4,
  "balance": 1520,
  "xp": 5400,
  "level": 12,
  "nextClaimAt": "2026-11-24T08:00:00Z",
  "serverTime": "2026-11-23T08:00:00Z"
}
```

- `balance` = the wallet balance after the credit (same as `transaction.balanceAfter`).
- `xp` / `level` = the player's totals after the grant (omit if unchanged).
- Not claimable: HTTP 4xx `BusinessException` with code `DAILY_LOGIN_ALREADY_REDEEMED`
  (the app then re-reads `/status`, so any message text is fine). It must be safe to call
  repeatedly.

### Backwards compatibility

Keep `POST /v1/daily-login/redeem` as a deprecated alias of `claim` (same eligibility
rules, old response shape `{ rewardedFahhcoin, balance }`) until old app builds are gone.
The new app only calls `status` + `claim`. If `/status` returns 404 the app silently
disables the feature (no popup, no errors), so the app can ship before the backend.

## Data

```sql
CREATE TABLE daily_login_state (
  user_id       BIGINT PRIMARY KEY REFERENCES users(id),
  last_claim_at TIMESTAMPTZ NOT NULL,
  streak        INT         NOT NULL,          -- chain length at last claim
  version       BIGINT      NOT NULL DEFAULT 0 -- optimistic lock
);

-- reward config (or daily-login.rewards[n].* properties; a table lets ops tune it)
CREATE TABLE daily_login_reward (
  day           SMALLINT PRIMARY KEY CHECK (day BETWEEN 1 AND 7),
  coins         BIGINT   NOT NULL DEFAULT 0,
  xp            BIGINT   NOT NULL DEFAULT 0,
  store_item_id BIGINT   NULL REFERENCES store_item(id)
);
```

Seed day 1 with the current `daily-login.reward-fahhcoin` so existing behaviour is
preserved, plus the numbers you prefer for days 2–7 (day 7 clearly the biggest).
Ledger rows keep `type = DAILY_LOGIN_REWARD`, `refType = "DAILY_LOGIN"`,
`refId = "<userId>:<streak>"` (unique per claim, which also gives you a DB-level
duplicate guard).

## Tests worth having

- first claim → day 1, streak 1; second claim within 24h → rejected, balance unchanged
- claim at 24h01m → day 2; at 47h59m → streak continues; at 48h01m → resets to day 1
- 7th consecutive claim → day 7 rewards; 8th → day 1 again, `streak = 8`
- two concurrent claims → exactly one succeeds, exactly one ledger row
- `/status` for a broken chain reports `streak = 0`, `todayIndex = 1`, `claimable = true`

## Frontend notes (for reference)

- App flag `VITE_DAILY_REWARD_MOCK=true` swaps the API for an in-browser simulator of this
  exact contract (`src/api/dailyRewardMock.js`), for development before this ships.
- The popup shows after login / app open / return from background when `claimable`, never
  during a run or the post-run screens, and at most once per claimable day; afterwards a dot
  on the menu button and a row in the Me tab reopen it.
