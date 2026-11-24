# Welcome bonus popup - backend contract

For Manoj. The app shows a one-time "Welcome, Runner! +N Fahhcoins" popup after a
player's first login. The popup only **announces** coins the server already granted;
the client never credits anything. The amount shown comes from the server.

## What exists today (`feature/territory-game`, commit `d99c59c`)

| Question                               | Answer                                                                                                                                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Amount                                 | `signup-bonus.fahhcoin=50` (`SignupBonusProperties`), configurable                                                                                                                                                         |
| Where granted                          | at **registration**, not first login                                                                                                                                                                                       |
| Email signup                           | yes - `AthleteServiceImpl.signupAthlete`                                                                                                                                                                                   |
| Google / Apple signup                  | yes - `AuthServiceImpl.findOrLinkOrCreateOAuthUser` (new-user path)                                                                                                                                                        |
| Ledger                                 | `SIGNUP_BONUS`, `referenceType="USER"`, `referenceId=<userId>`                                                                                                                                                             |
| Existing players                       | `V1_2__signup_bonus_transaction_type.sql` backfilled +50 to every active athlete with an empty ledger (`SIGNUP_BACKFILL`)                                                                                                  |
| Amount exposed to the app              | **no** - the profile only returns `fahhcoinBalance`                                                                                                                                                                        |
| "Welcome bonus seen/acknowledged" flag | **none**                                                                                                                                                                                                                   |
| `firstLogin`                           | exists on `AuthResponse`/`UserResponse`, but it is just `lastLoginDateTime == null`: true for one response, then false forever. It is not durable (a failed/killed first session loses it) so the popup cannot rely on it. |

## Needed

### 1. `GET /v1/welcome-bonus/status` (authenticated)

```json
{ "amount": 50, "granted": true, "acknowledged": false }
```

- `granted` - the user has a `SIGNUP_BONUS` ledger row, from registration **or** from the
  `SIGNUP_BACKFILL` migration (existing players got their 50 that way, so they see the
  popup once too). No such row (e.g. they already had coin activity and were skipped by
  the backfill) -> `granted=false` -> no popup.
- `amount` - the **actual ledger amount** of that row (so it stays right if the config
  changes later); `0` when not granted.
- `acknowledged` - the player has already been shown the popup (see 3).

### 2. `POST /v1/welcome-bonus/acknowledge` (authenticated, empty body)

Sets `user.welcome_bonus_acknowledged_at = now()` if it is null. **Idempotent**: calling
it again (retry, double tap, two devices) returns the same success and changes nothing.
Response: the same object as `GET /status` (with `acknowledged: true`). Never credits
coins.

### 3. Data

```sql
ALTER TABLE `user` ADD COLUMN `welcome_bonus_acknowledged_at` DATETIME(6) NULL;
```

Leave it `NULL` for **everyone**, existing players included: each account sees the
popup once, the next time it opens the game after deploy, then it is acknowledged for good.
(Do not backfill it - that would hide the popup from existing players.)

### Rules the app relies on

- Per **account**, not per device: reinstall / new device / relogin never shows it again
  once acknowledged.
- `granted=false` (bonus set to 0, or social account created before the bonus existed)
  -> the app shows nothing.
- If `/status` returns any HTTP error (for example 404 before this ships) the app
  silently skips the feature - no popup, no error.

### Tests worth having

- new email / Google / Apple account -> `granted=true, amount=50, acknowledged=false`
- acknowledge twice -> both succeed, timestamp unchanged by the second
- existing backfilled account -> `granted=true, amount=50, acknowledged=false` until acknowledged
- existing account with no signup/backfill ledger row -> `granted=false`
- `signup-bonus.fahhcoin=0` -> `granted=false`
- acknowledging never changes the wallet balance

## Frontend notes

- `VITE_WELCOME_BONUS_MOCK=true` swaps the API for a local simulator of this contract
  (`src/api/welcomeBonusMock.js` behaviour inside `src/api/welcomeBonus.js`).
- Per-account `localStorage` key `welcome_bonus_ack_<userId>` is only a fast cache; the
  server flag always wins, and the cache is written only after a successful acknowledge
  (or a server `acknowledged: true`).
- Popup order: rollout-blocking popup -> welcome bonus -> first-time walkthrough ->
  daily reward. Never during a run.
