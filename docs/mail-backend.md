# Mail: what the backend sends, and what the app shows

Checked against `origin/feature/territory-game` (278a2bf). `main` only has e-mail (SMTP), no in-game mail.

## Types (`MailTypeConstant`)

`NOTICE`, `CLUB_INVITE`, `STORE_ITEM_GRANT` (claimable), and the read-only event types `RUN_RESULT`, `PVP_RESULT`, `CLUB_WAR_RESULT`, `TERRITORY_CAPTURED`, `TERRITORY_LOST`, `LEVEL_UP`, `REWARD`, `PROGRESS`.
**`PROGRESS` exists but is never sent.**

Event mails are created through `MailEventPublisher` → `MailEventListener` (after the event's transaction commits, best effort, failures only logged) → `MailboxService.sendEventMail`, which stores the details as JSON and pushes the mail over the `/specific/{userId}` socket.

`MailResponse` always has `id`, `type`, `title`, `body`, `status` (UNREAD/READ/…; the read flag), `readAt`, `createdDate`, `data` (map, same JSON as `payload`). The app reads `type` as the switch key; an unknown type renders as a plain "Message".

## Fields the app renders (`src/utils/mailDetails.js`)

A row is hidden when its value is null, missing, not a number/string, or (for counts) zero.

| Type               | `data` fields sent                                                                                                                                  | Rendered                                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RUN_RESULT         | runId, mode, status, distanceMeters, durationSeconds, score, xpEarned, **coinsEarned (always null)**, territoriesClaimed                            | mode, counted / not counted (REJECTED), distance, time, score, XP, territories. `coinsEarned` is shown only if it ever becomes > 0                         |
| PVP_RESULT         | challengeId, runId, result (WIN/LOSE/DRAW/REFUND), ownRaceTimeSeconds, opponentRaceTimeSeconds, opponentName, stakeAmount, payoutAmount, newBalance | result, opponent, both times, stake, payout (0 kept), new balance. `newBalance` also updates the coin store (ignored if older than the last balance write) |
| CLUB_WAR_RESULT    | warId, result, ownScore, opponentScore, clubName, opponentClubName, trophyChange                                                                    | result, both clubs, score, signed trophies                                                                                                                 |
| TERRITORY_CAPTURED | territoryId, areaSqm, runId                                                                                                                         | area                                                                                                                                                       |
| TERRITORY_LOST     | territoryId, areaSqm, byUserName, runId                                                                                                             | taken by, area                                                                                                                                             |
| LEVEL_UP           | newLevel, xpTotal                                                                                                                                   | new level, total XP                                                                                                                                        |
| REWARD             | coins, itemId                                                                                                                                       | coins, "item added" (the item name isn't in the mail)                                                                                                      |
| PROGRESS           | none                                                                                                                                                | title + body only                                                                                                                                          |

A live `REWARD` mail only triggers a throttled balance re-read: its `coins` is an amount, not a balance, and the claim response may already have applied it.

## Gaps for Manoj (not fixed by the app)

1. **No OS push (FCM) for event mails.** They only go over the socket, so they reach a player only while the app is open (the app also re-syncs mail on resume). If you want a notification when the app is closed, send an FCM with `data.type = MAIL` and `data.mailId`; the app opens the inbox for it.
2. `RUN_RESULT.coinsEarned` is always null.
3. `REWARD` carries only `itemId`, not the item name.
4. `PROGRESS` is never sent.
