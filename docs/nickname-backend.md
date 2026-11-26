# Nicknames everywhere: audit and backend ask

Rule (one helper, `src/utils/playerName.js`): trimmed nickname if non-empty (whitespace-only counts as
empty), else the real name (first word), else a fallback ("Runner" via `displayName()`; callers that need
"a rival" pass their own).

Exports: `getDisplayName` (alias `playerNameOf`), `displayName`, `getRoleDisplayName(obj, 'owner')` for
`<role>Nickname` + `<role>Name` pairs, `initials`, `initialsOfName`, `<DisplayName>`.
Accepts `nickname / nickName / displayName`, then `fullName / name / username / userName / firstName+lastName`,
plus nested `user / player / owner / athlete / member / profile`.

## Why the leaderboard still shows real names

The individual leaderboard response (`IndividualLeaderboardResponse`) has **no nickname field at all**, only
`fullName`. The app already reads `nickname` from each row and uses it the moment it exists, so this cannot be
fixed in the frontend alone (a per-row profile lookup would be 20+ extra requests per page).
The player's own row is fixed in the app (it uses their own nickname).

## What each endpoint returns today

| Response (backend DTO)                                                                                         | Used by                                       | Nickname today       | Added on `feature/nickname-in-responses`     |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------- | -------------------------------------------- |
| `IndividualLeaderboardResponse`                                                                                | Leaderboard (all tabs, podium)                | no                   | `nickname`                                   |
| `RaidLeaderboardResponse`                                                                                      | raid leaderboard                              | no                   | `nickname`                                   |
| `NearbyPlayerResponse`                                                                                         | PvP rival picker                              | no                   | `nickname`                                   |
| `RunChallengeResponse`                                                                                         | PvP race, Next Rival, result, challenge popup | no                   | `challengerNickname`, `opponentNickname`     |
| `MatchmakingQueueEntryResponse`                                                                                | PvP quick match                               | no                   | `opponentNickname`                           |
| `MailResponse`                                                                                                 | Mail sender                                   | no                   | `senderNickname`                             |
| `TerritoryParcelResponse`                                                                                      | territory popup / owner                       | no                   | `ownerNickname`                              |
| `ClubResponse`                                                                                                 | Club captain                                  | no                   | `leaderNickname`                             |
| `ClubJoinRequestResponse`                                                                                      | Club join requests                            | no                   | `requesterNickname`                          |
| `SavedRouteResponse`, `SavedRouteDetailResponse`                                                               | saved routes                                  | no                   | `ownerNickname`                              |
| `UserResponse`, `UserPublicProfileResponse`, `ClubMembershipResponse`, `ClubWarParticipant*Response`           | Me, profiles, club members, war               | **yes**              | (already)                                    |
| `FraudFlagResponse`                                                                                            | admin                                         | yes (`userNickname`) | (already)                                    |
| `EventRegistrationResponse`, `AthleteSignupResponse`, `UserCreateResponse`, `BroadcastMailResponse.authorName` | admin / registration / system mail            | no                   | not added on purpose (real registered names) |

Backend change: branch `feature/nickname-in-responses` in the backend repo (cut from `feature/territory-game`,
commit `42d4a6e`). 10 DTOs plus the mapper sites, additive only, populated from `User.getNickname()` (the user is
already loaded, no extra queries). **Not compiled** (no JDK in the authoring environment): run
`./mvnw -DskipTests compile` before merging. Not merged, not deployed.

Message for Manoj: "Return `nickname` next to `fullName` on the individual and raid leaderboards and on
NearbyPlayerResponse, and `<role>Nickname` next to `<role>Name` on RunChallengeResponse (challenger/opponent),
MatchmakingQueueEntryResponse (opponent), MailResponse (sender), TerritoryParcelResponse (owner), ClubResponse
(leader), ClubJoinRequestResponse (requester) and SavedRoute*Response (owner). Null or blank when the player has
none. Branch `feature/nickname-in-responses` has it."

## Frontend: where names are rendered

All of these already go through the helper; the table records what changed in this pass.

| File                                                                                                 | Before                                                   | Now                                                                                                                             |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `pages/GamePage.jsx` leaderboard rows                                                                | `playerNameOf(entry)` (no nickname in payload)           | same, and **own row** uses `user.nickname`                                                                                      |
| `components/LeaderboardPodium.jsx`                                                                   | renders `entry.name`                                     | unchanged (name comes from the helper)                                                                                          |
| `hooks/usePvp.js` `partyOf` / `mySide`                                                               | `<role>Nickname` + `<role>Name` through `getDisplayName` | unchanged (already)                                                                                                             |
| `components/PvpPanel.jsx`, `PvpResultPopup.jsx`, `ChallengePrompt.jsx`, `usePvpPostRun.js`           | display name from `mySide`                               | unchanged (already)                                                                                                             |
| `components/PvpPanel.jsx` nearby list                                                                | `playerNameOf(p)`                                        | unchanged; picks up `nickname` when the backend sends it                                                                        |
| `components/ClubPanel.jsx` leader / requester / members                                              | `getDisplayName({nickname, fullName})`                   | unchanged (already)                                                                                                             |
| `components/ClubPanel.jsx` invite search                                                             | matched only `fullName`                                  | matches full name **and** nickname                                                                                              |
| `components/ClubWarPanel.jsx`, `ClubWarHistory.jsx`                                                  | `playerNameOf(p)`                                        | unchanged (already)                                                                                                             |
| `components/MailDetail.jsx`, `utils/mailDetails.js`                                                  | `senderNickname` / `opponentNickname` through the helper | unchanged (already)                                                                                                             |
| `GamePage.jsx` / `TerritoryMap.jsx` / `utils/territoryGame.js` owner                                 | `ownerNickname` read, defaults to null                   | unchanged (already)                                                                                                             |
| `components/AthleteTerritoryProfilePanel.jsx`                                                        | `playerName(nickname, fullName)`                         | unchanged (already)                                                                                                             |
| `components/Navbar.jsx`, `pages/LoginPage.jsx` welcome                                               | `playerNameOf(user)`                                     | unchanged (already)                                                                                                             |
| `game/ui/Avatar.jsx` initials                                                                        | own copy, `parts[0][0]` (breaks on emoji)                | shared `initialsOfName` (emoji-safe)                                                                                            |
| `pages/FraudFlagsPage.jsx`, event / athlete / moderator / contact / register pages, `MailToolsPanel` | real name                                                | **left as is on purpose**: admin / registration screens identify people by real name. Allowlisted in `displayNameGuard.test.js` |

## Regression guard and tests

- `src/utils/displayNameGuard.test.js` (existing, extended): fails when a game-facing `.jsx` file renders a raw
  name field (`x.fullName`, `x.ownerName`, `x.userFullName`, ...) in JSX braces or a template string instead of
  the helper. Admin and website pages are allowlisted.
- `src/utils/playerName.test.js` (new, 12 tests): nickname, empty, whitespace-only, missing both, every field
  name, nested objects, role pairs, initials.
