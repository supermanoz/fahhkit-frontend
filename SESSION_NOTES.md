# Territory Run — Session Notes

Working log of feature work on the Territory Run game (`GamePage`, `TerritoryMap`), kept so a
future session (Claude or otherwise) can get oriented quickly without re-reading the whole diff.
Update this as work continues rather than starting a new file each time. Git history/commit
messages have the precise diffs — this is the "why" and "what's still open" that doesn't show up
in a `git log`.

Last updated: 2026-10-28, branch `RUN_CONQUER`, latest commit `91ceadc`.

## Club system

- `src/api/club.js` + `src/components/ClubPanel.jsx`: create a club, browse/search clubs, request
  to join, leave your own club. New "Club" tab in the fullscreen menu.
- Wired to the real backend (`ClubController` in the sibling FahhKit repo, `~/Documents/FahhKit`) —
  verified field-for-field against `ClubResponse`/`ClubCreateRequest`/`DataPagination`.
- **Scope cut, not a bug**: leader/co-leader tooling (review join requests, roster, kick,
  promote/demote, transfer leadership) exists server-side but has no frontend yet.

## Territory merging

- Problem: the backend stores one `TerritoryParcel` row per claimed GPS loop, so two adjacent runs
  show up as two separate parcels with a visible seam between them on the map, and as two separate
  rows in the Me tab's "My Territories" list (more/smaller entries than what reads as one connected
  territory).
- Fix: `mergeTouchingParcels` in `src/utils/territoryGame.js` — geometric union via the
  `polygon-clipping` package (was an installed-but-unused dependency, apparently intended for
  exactly this). Groups by owner, unions same-owner parcels; touching/overlapping ones fuse into
  one shape, non-touching ones stay separate. Recomputes area geometrically rather than summing.
- Used by both `TerritoryMap.jsx` (map rendering + badge markers, one badge per merged shape now)
  and `GamePage.jsx`'s "My Territories" list and the main HUD's territory count — all three used to
  disagree, now they don't.
- `sourceIds` on each merged shape tracks which original parcel ids fed into it, so
  highlight/focus-on-a-specific-parcel (from the Me tab) still resolves correctly.

## Running View (Google Maps nav-mode)

- While a run is being tracked, the map can auto-follow the player and rotate so the direction of
  travel points up, like Google Maps' "start riding" view.
- Toggle button ("Switch to Normal View" / "Switch to Running View") in the tracking controls
  (`GamePage.jsx`'s `navViewOn` state) — defaults to Running View each time a run starts, freely
  switchable back and forth during the same run.
- Implementation: `TerritoryMap.jsx`'s `.territory-map-heading` wrapper CSS-rotates the whole map
  (basemap + Leaflet overlay together, since they're both children of one element — necessary
  because Leaflet has no native bearing/rotation support, so only rotating the MapLibre layer would
  desync territory polygons from the roads under them). `scale(1.5)` on that wrapper keeps the
  rotated rectangle covering the viewport at any angle (verified visually at 45°/135° — no gaps).
  **Deliberately no 3D tilt during nav mode** — an earlier attempt stacked a `rotateX` tilt on top
  of the rotation/scale and it broke into a flattened, sideways-looking "landscape" camera; nav
  mode is 2D rotation + auto-follow only.
- **The actual bug that took two rounds to find**: GPS/WiFi fixes jitter by meters even standing
  still (`MAX_ACCEPTABLE_ACCURACY_METERS` in `utils/run.js` admits up to 20m-accuracy points), so
  naively recomputing a heading from any small position delta spun the whole map on pure
  positioning noise, not real movement. Fixed in `GamePage.jsx`'s heading effect: only trust a
  heading change when the fix's own _reported speed_ (an independently measured quantity, not
  inferred from position deltas) clears a walking-pace floor (0.5 m/s); prefer the device's own
  `coords.heading` (added to `useRunTracker.js`'s point shape) over a derived bearing when speed
  clears that floor; otherwise only derive a bearing once movement clearly exceeds both fixes'
  combined GPS accuracy margin (was a flat 3m, now 8m+accuracy-aware); ease into any change via
  `smoothAngle` (circular exponential smoothing, `utils/territoryGame.js`) instead of snapping.
  Verified live in a real browser (see below) that a stationary tracked run now holds `rotate(0deg)`
  instead of spinning.

## HUD / UI

- Persistent level/XP pill on the main HUD, top-left corner (was buried in the menu) — clickable,
  jumps to the Me tab. Shows first name + level + XP bar.
- `IconShineOrbit` component (`src/components/IconShineOrbit.jsx`): a small gold spark takes a
  slow loop around the hamburger menu button and the level badges, via anime.js's
  `createMotionPath` (same mechanic `TapEffect.jsx` already used for the one-off tap flourish).
- Run Conquest logo (background removed with Pillow flood-fill, cropped to content) now shows
  centered over the radial menu instead of the old wood-sign "Territory Run" banner.
- Button sounds: synthesized crisp/dry noise-burst click (`playClickSound`) for most buttons, a
  real sample (`public/audio/button-click.mp3`, `playMenuSound`) for the hamburger/radial menu
  button specifically.
- Dark mode is now the default (was: auto sunrise/sunset via `utils/sunTimes.js`, removed entirely
  per explicit request — light is now purely a manual opt-in via the moon/sun toggle).
- Live "Distance" stat during a run refreshes every 5s instead of every render tick (Pace/Time
  unaffected, still real-time).
- Removed: the admin-only "Tap to Draw Territory" testing tool (manual polygon entry), the top-left
  exit/back button, the decorative map vignette was briefly removed then restored (it's the
  intentional radial edge-darkening "fog outside your view radius" effect, not a bug).
- Adjacent-territory-merge also fixed a related visual bug: the bottom control sheet
  (`.game-controls`) used to render as a bare dark-wood bar with nothing in it during idle map
  browsing (since "Start Conquering" lives in the radial menu, not this sheet) — now transparent
  when empty, keeping height reserved so the FAB/mute/dark-mode buttons don't jump.

## Testing note

- The dev server (`npm run dev`) serves over **HTTPS with a self-signed cert** (`basicSsl()` plugin
  in `vite.config.js`, needed for `navigator.geolocation` to work off `localhost`) — use
  `https://localhost:5173`, not `http://`. Plain HTTP silently fails with an empty reply, which
  cost real time to figure out mid-session.
- Chrome DevTools Protocol geolocation override isn't exposed through the available browser
  automation tools here, so simulating real GPS movement for testing isn't straightforward;
  validated the nav-mode rotation/scale geometry instead by directly setting
  `.territory-map-heading`'s transform via injected JS and screenshotting at several angles.

## Where things live (quick map)

| Area                      | File(s)                                                |
| ------------------------- | ------------------------------------------------------ |
| Club UI                   | `src/api/club.js`, `src/components/ClubPanel.jsx`      |
| Territory merge logic     | `src/utils/territoryGame.js` (`mergeTouchingParcels`)  |
| Map rendering, nav mode   | `src/components/TerritoryMap.jsx`, `TerritoryMap.css`  |
| Run tracking, GPS heading | `src/hooks/useRunTracker.js`, `src/pages/GamePage.jsx` |
| Sounds                    | `src/utils/gameSound.js`                               |
| Shine-orbit effect        | `src/components/IconShineOrbit.jsx`                    |
| Visual style reference    | `style.md` (repo root)                                 |

## Backend

- Sibling repo at `~/Documents/FahhKit` (Spring Boot). **Never edit it** — diagnose only, hand off
  fixes as a spec even if asked directly.

## Real-world map sky (replaces dark/light toggle)

- `src/utils/mapAmbience.js`: fetches current weather + sunrise/sunset from Open-Meteo (free,
  keyless, browser-callable) for the player's location and maps it to a phase
  (dawn/day/dusk/night) × sky (clear/partly/overcast/fog/rain/snow/storm).
- Look = stacked CSS filter on the basemap (`--ambience-filter` on `.territory-map`) plus a
  `.territory-map-sky` overlay (sun glare, twilight tint, rain/snow/fog/lightning). Night reuses
  the old dark-mode inversion. Animations are off under `prefers-reduced-motion`.
- GamePage holds the loading screen ("Checking the sky…") until the weather lookup finishes or a
  5s timeout passes. If the lookup fails, it falls back to a device-clock day/night guess.
  Refetches every 15 min and re-checks the phase every minute.
- The sun/moon button is removed; weather is shown via a one-off hype pop-up after load instead.
- Open-Meteo's free tier is non-commercial only. A paid plan (or proxying through the backend) is
  needed before a commercial launch.

## Blaze animated map sprite

- When Blaze is the active avatar (free pick or equipped Store Hero, same `showBlazeHeroSprite`
  check as the Me tab), the map marker is a full-body sprite instead of the round photo:
  `blaze-map-idle.png` when still, and `blaze-map-run-{up,down,left,right}.png` while moving.
  Each is a 4-frame, 48×64 horizontal strip stepped by CSS (`.territory-map-blaze`).
- The strips were cut from the artist's white-background sheets (edge flood-fill to transparent,
  frames bottom-aligned into uniform cells, 2× resolution). The originals are not in the repo.
- Moving (run animation) = a real jog, not phone wobble: fixes with accuracy ≤ 25m only; ≥ 2 fixes in
  the last 12s reporting speed ≥ 1.8 m/s (skipped if the browser never reports speed) AND straight-line
  ground covered in that window ≥ max(8m, worse fix's accuracy) at ≥ ~1.26 m/s average. Held 3s after
  the last qualifying fix so it doesn't flicker. Heading cone still uses the looser 0.5 m/s rule. `liveLocation` now keeps
  speed/heading/accuracy, so the heading cone also works outside a tracked run. Direction = heading
  quadrant (north = up). Nav view always uses "up" and counter-rotates him to stay upright.

## Backend catch-up (2026-09-25) — mail, PvP races, heroes, raid, Google sign-in

Frontend for backend commits `ea0f213`…`d528e87` on `feature/territory-game`:

- **Live pushes**: `src/hooks/useGameSocket.js` (`@stomp/stompjs`, raw WS at `{api}/ws`). `/specific/{userId}`
  carries run outcome (`outcome`), mail (`recipientId`+`type`) and territory events (`eventType`) — sniffed
  by shape. PvP has its own `/specific/{userId}/pvp-*` sub-destinations. Everything degrades to REST
  polling if the socket never connects.
- **Run outcome**: rejected runs (cheat / loop not closed / area too small / crossed itself) now show a
  reason toast instead of the generic timeout. `LOOP_MIN_AREA_SQ_METERS` is 2000 to match the server.
- **Mail tab**: `useMailbox` + `MailPanel` (inbox + News/broadcasts, claim gift, join/decline club invite).
- **Race tab**: `usePvp` + `PvpPanel` — quick match queue, nearby discovery (opt-in, location pinged every
  2 min), direct challenge with custom stake, accept/decline/cancel, results. "Start Race Run" starts the
  tracker with `challengeId` (persisted in the tracker's saved run) and `createRun` sends it.
- **Heroes**: own **Heroes** menu tab (`HeroGallery`, Dota-style tall cards). Heroes with sprite strips
  (`src/utils/heroSprites.js`, keyed by lowercased name - only Blaze today) stand animated in their card
  and break into a run on hover; others show their portrait. Tapping opens `HeroDetailModal` (pose
  toggle, ability stat bars, backstory lore, skins with Equip / Buy → the normal purchase confirm).
  Shop keeps a "Meet the Heroes" link; HERO items still show their perk.
- **TEMP: Blaze is everyone's default hero.** The backend's seeded "Default Hero" item (owned+equipped by
  every account) is ignored by the frontend (`isPlaceholderHero` in `utils/hero.js`) and hidden from the
  Heroes tab, so anyone without a real Store Hero equipped plays as Blaze. The Shop's free Avatar picker is
  hidden (it duplicated Heroes) and `avatarId` is pinned to Blaze. Avatar art in `constants/avatars.js`
  now doubles as hero portraits by name (`getAvatarByName`). Search `TEMP` to revert.
  Caveat: server-side the player still has "Default Hero" equipped, so Blaze's +5% PACE perk is **not**
  applied to scoring until the backend grants/equips a Blaze skin by default.
- **Clubs**: partial-name search via `/v1/club/search`; leaders/co-leaders get "Invite to my club" on a
  player's profile (sends a CLUB_INVITE mail).
- **Raid events**: RAID type + target score on create/edit, boss-HP bar on event detail, raid events
  allowed on Track a Run.
- **Google sign-in**: `GoogleSignInButton` on Login (hidden unless `VITE_GOOGLE_CLIENT_ID` is set).

## Club description edit, territory flag, font, hero cards (2026-09-28)

- **Club description editable** by leader/co-leader (✎ Edit on the club banner). Calls
  `updateClubDescription` → `POST /v1/club/description { description }` (backend 252efd0; server
  resolves the caller's club, leader/co-leader only).
- **Own-territory marker** is now a waving flag in the player's colour (SVG, anchored at the pole's
  foot). The round badge and the equipped TERRITORY_EMOJI image are gone from the map.
- **Font**: `.game-page *` forces Passion One so library-styled bits (Leaflet/MapLibre controls,
  popups) can't fall back to the system font.
- **Hero grid** (Shop): Dota 2 picker style - small 16:9 tiles packed side by side, name strip at
  the bottom, price/status chip top-right, ⚡ pips per perk; hovering pops a tile out (scale 1.18)
  and dims the rest. Tier colour = bottom edge/glow (gold in play, green owned, purple buyable,
  grey soon). Perk text lives in the hero modal.
- **Shop shelves**: HERO items (incl. the placeholder "Default Hero") no longer appear in Items -
  heroes live in the gallery. TERRITORY_SHADE items have their own "Territory Colors" section in the same
  Dota-style tile grid (tap = buy, or equip/unequip if owned); each tile (and the buy confirm) is
  `ShadeFlag`, a clean shaded flag on a metal pole over a dark vignette (no scenery; it
  replaced the earlier ShadePreviewMap mini-city). The hero "Collection x/y" meter was removed.

## Menu/settings/club tidy-up (2026-09-28)

- Phone menu header: tab picker bar is full width; the red close (X) perches on its top-right corner.
- Map style picker moved from Settings to the Shop ("Map Style", between Territory Colors and Items).
- Shop Items hides seeded freebies whose name starts with "Default" (Default Avatar Border / Profile
  Background) - name-based filter, since the backend has no flag for them.
- Settings: Sound + Visibility rows with chunky `.game-switch` toggles. Visibility = PvP discoverable.
  The Nearby Runners scan/challenge card moved to the Race tab (without its own toggle).
- Club roster: rows no longer carry Promote/Demote/Make Leader/Kick. Tapping a member opens their
  profile (AthleteTerritoryProfilePanel) with a "Club actions" row, built by ClubPanel `memberActions`
  and passed via `viewingProfile.clubActions`. Make Leader and Kick need a second tap to confirm.
- Phone tab dropdown overflowed the right edge (leftover `right: -46px` from when the X sat beside the
  bar) - now `right: 0`.
- **TEMP club badges**: `ClubBadge` draws a cartoon shield per club (colour + symbol hashed from the
  club name, initials on a ribbon). Used on the club banners, the browse list, and a new club chip on
  player profiles (shown when `profile.clubName` is set). Replace once the backend stores real badges.
- Club tab (not in a club): "Unlock Clubs" perks now include Club Wars; the create card's two blurb
  paragraphs are replaced by a plain "Create a Club" title.
- **Shop layout now**: Fahhcoin wallet bar on top (balance + "Get more" → coin shop) → Heroes →
  Territory Colors → Trail Colors → Map Style. The catch-all Items list is removed (borders, profile
  backgrounds, phrases etc. aren't sold in the Shop for now).
- Colour shelves share `ColorShelf` (no names; price / Owned / ✓ On chip bottom-right). Territory uses
  `ShadeFlag`; Trail uses `TrailPreview` (glowing GPS line in that colour, draws in on hover). Trail
  colour was already wired to the map (`equippedTrailColor` → TerritoryMap `trailColor`). A shelf hides
  itself when the catalog has no items in that category.
- Trail Colors not showing: backend's new trail colours (V1_44, 0a677d6) may not be on the test server
  yet, and the pre-migration default trail was hidden by the "Default…" filter. Colour shelves no
  longer filter defaults and always render (with an empty-state line).

## Hero roster, HUD, challenge prompt (2026-09-28)

- **Shop heroes** = Clash-style sideways carousel (`HeroGallery`): tall cards with a tier-coloured
  header (gold equipped / green owned / purple buyable / grey soon), hexagon crest, ⚡perk-count
  badge, hero on a wooden panel, and a fat foot bar (Unlock + price / Equip / Equipped / Coming soon).
  Scroll-snap swipe; round arrow buttons on wider screens. Replaces the Dota-style grid.
- Main HUD: the territory-count flag stat is removed (coin stat only).
- Territory/Trail colour tiles: roomier grid (14px gaps, 3 per row on phones), price chip is a dark
  HUD-style pill with the gold `.game-coin` (same face as the HUD coin).
- **Incoming PvP challenge prompt** (`ChallengePrompt`): pops over the map for any PENDING challenge
  someone else sent that I haven't confirmed - Accept / Decline / "Decide later" (hides it for the
  session; still in the Race tab). Vibrates + chimes once per challenge, and shows a system
  Notification if the tab is hidden and permission was granted (asked when turning Visibility on).
  `usePvp` now also polls challenges every 20s + on tab focus as a socket backstop. The old transient
  "You got called out" pill is gone. True background push (app closed) would need a service worker +
  backend Web Push - not implemented.
- Shop now has a tab row under the wallet: Heroes / Territory / Trail / Map (`SHOP_SECTIONS`,
  `shopSection` state, defaults to Heroes). Section titles renamed to Territory, Trail, Map
  (new `IconMap` in GameIcons). The hero carousel sits straight on the panel, no card box.
- Hero roster is now frameless: each hero stands on a tier-coloured floor glow, name + "⚡ n perks"
  under it, then the action bar - no card border/header/crest. Strip has 14px side padding.
- Shop wallet: no box and no "Fahhcoin" label - just coin, balance and "+ Get more" in one row.
- **Club role names**: UI says Captain / Vice-Captain (role codes stay LEADER / CO_LEADER). Backend
  error messages and mail titles/bodies are reworded client-side by `toClubRoleWords` in
  `api/client.js` (leader→captain, co-leader→vice-captain, leadership→captaincy; "leaderboard"
  untouched) - ApiError applies it automatically. Other club UI: member pages hide boxes per row,
  Me tab shows club badge before the club name, parcel flags removed.

## Nicknames (2026-09-28)

- `utils/playerName.js`: `playerName(nickname, fullName)` / `playerNameOf(obj)` → nickname, else the
  first word of the full name. Used for every player name in the game (club rosters/requests/invite
  results/captain, club war squads, PvP opponent + challenge prompt + notification, nearby runners,
  mail sender/author, leaderboard podium, parcel owner banner + highlight toast, profile panel, Me tab,
  level bar) plus the Navbar user menu and the login welcome toast. Admin/official pages (registrants,
  athlete search, moderators, event reports) keep full names on purpose.
- Only UserResponse, UserPublicProfileResponse, ClubMembershipResponse and ClubWarParticipantResponse
  carry `nickname`; everything else falls back to the first name. Club roster rows pass `nickname`
  through `onViewProfile` so the profile panel shows it.
- Me tab shows `NicknameCard` ("Pick your runner tag") while `user.nickname` is empty → `setNickname`
  (`api/user.js`, `POST /v1/user/edit-profile { nickname }`, partial update, 3-20 [A-Za-z0-9_], unique).
  `useCurrentUser` now returns `replaceUser` to swap in the updated user + localStorage cache.
- HUD coin counter: bar removed - just the outlined number (no shadow) beside the coin.
- Fahhcoin bundles: frontend already loads them from `GET /v1/coin-purchase/bundles` (nothing
  hard-coded). The backend serves them from the `FahhcoinBundleConstant` enum, so changing bundles
  still needs a backend deploy - a DB/admin-managed bundle table would be a backend change.
- Map: the flag marker on the player's own territories is removed (and its `.territory-flag` CSS) -
  territories are just their coloured polygons now. Tapping a parcel still opens the owner flow.

## Backend catch-up 2 (2026-09-28) - commits 8f06940…6c1b82d

- **PvP forfeit** (6c1b82d): `forfeitChallenge` → `POST /v1/run-challenge/{id}/forfeit`, `pvp.forfeit`.
  Race tab shows a Forfeit button on IN_PROGRESS races whose run I haven't submitted (server rule),
  two taps ("Give up N 🪙?"), disabled while a run is being tracked. Instant loss, rival takes the pot
  (`WIN_BY_FORFEIT` → "Lost by forfeit"). The response has no invalid-reason fields, so "you
  forfeited" vs "ran out of time" can't be told apart client-side.
- **Club description endpoint moved** back to `POST /v1/club/{id}/update` (id unused server-side).
- **Club creation costs 500 Fahhcoin** (8f06940, `ClubProperties.creationCostFahhcoin`) - mirrored as
  `CLUB_CREATION_COST`; Create button shows the cost and is disabled when the balance is short.
- **Nickname lookup** (f991ee9): `findPlayerByNickname` (`GET /v1/user/search-by-nickname`, exact,
  case-insensitive) runs alongside the leaderboard scan in club invite search; a hit is listed first.
- **Limited heroes** (6c1b82d): `hero.limited` = not purchasable (Blaze is limited; Phantom, Bolt,
  Cyclone, Pulse now sold at 5000). Gallery shows a gold "🔒 Limited" foot; the hero modal's buy
  buttons read "Not for sale" and are disabled.
- Also server-side only: join requests now mail the captain/vice-captains, challenge accept/decline/
  forfeit send mailbox notices, cancelled/declined races drop out of race history.

## PvP flow redesign (2026-09-28)

- PvP tab (renamed from Race; tab id still `race`) is now a step flow in `PvpPanel`:
  home (hero "Find a Race" + your active races + history link) → 1 Pick a distance (Sprint / Classic /
  Endurance cards) → 2 Choose your rival (Quick Match | Challenge Nearby) → 3 Searching radar (queue)
  or runners near you → stake step → 4 Race screen (You VS rival, distance/pot/clock, Matched → Locked
  in → Run → Result timeline, Accept/Decline/Cancel/Start Race Run/Forfeit, result, Race Again).
- Queue match auto-opens its race via `queueEntry.matchedChallengeId`; accepting from the challenge
  pop-up opens it via `focusRaceId` (GamePage `pvpFocusId`, cleared by `onFocusHandled`).
- `NearbyRunners.jsx` deleted - nearby scan/challenge lives in the flow. Old PvP CSS removed.
- All coins in PvP use `.game-coin`; `usePvp.joinQueue` now returns the entry (null on failure).
- **Pushes don't arrive in dev**: backend `/ws` only allows `fks.allowed.origins` (default
  `http://localhost:8000`); the test server 403s the handshake from `https://localhost:5173` and
  `https://192.168.1.69:5173`. Backend fix: add the frontend origins to that property. Frontend
  backstop: `usePvp` polls every 5s while waiting on the rival (20s otherwise) and fires the same
  "Race is ON" / "results are in" alerts when a poll sees a status change.
- **Club war phase flips / results** (no socket push exists for wars; the server's phase scheduler
  runs once a minute): `useClubWarWatch` (page level, only when in a club) polls the active war -
  every 60s, every 5s from a minute before the prep/battle deadline, every 2 min with no war - and
  announces "Battle has begun!" and Victory / Defeat / draw over the map (tap → Club tab). Your side
  is matched by club name (profiles carry no club id). `ClubWarPanel` also polls/ticks every 5s near
  a deadline so the open panel flips within seconds.
- Incoming challenges: while Visibility (discoverable) is on, `usePvp` polls challenges every 8s so the
  challenge pop-up shows within seconds without the socket push. Poll cadence: 5s waiting on rival /
  8s discoverable / 20s otherwise (+ on tab focus).
- **Auto-redirect to the race**: when a race of mine goes live (rival accepted my direct challenge) or
  the queue matches me - via push or via polling (`usePvp` now also raises the `matched` alert from the
  queue poll) - GamePage sets `pvpFocusId` and opens the PvP tab on that race screen (skipped while a
  run is being tracked; the callout pill still shows). Accepting from the challenge pop-up already did.
  Direct challenges: the challenger is auto-confirmed, so the opponent's accept makes it IN_PROGRESS.
- Match-found push now also stores `matchedChallengeId` on `queueEntry` (it only set status before),
  so PvpPanel's searching screen jumps to the race itself. If the race is still loading, the searching
  screen shows "Rival found!" (gold radar) with a "Go to Race" button instead of "Joining the queue…".
- **Queue status gotcha**: backend `GET /v1/pvp/queue/status` only returns WAITING entries - after a
  match (or expiry) it returns null, never MATCHED/EXPIRED. `usePvp`'s queue poll now treats
  WAITING → null as "resolved" and checks the race list: a PENDING, unconfirmed QUEUE race at that
  distance = matched (`markMatched` stores `matchedChallengeId`, raises the `matched` alert), else
  expired. The searching screen then shows "Rival found!" for 1.5s (`FOUND_FLASH_MS`) and opens the
  race; GamePage's redirect skips `matched` when the PvP tab is already open so the flash is seen.
  Backend improvement (optional): have /status return the latest entry (incl. MATCHED + id).
- PvP quick-match stakes: frontend `PVP_MODES` now 500 m = 50, 1 km = 100, 5 km = 500. The server
  charges its own `run-challenge.queue-stake-amounts.*` (still 10/20/50 in application.properties) -
  backend config must be updated to match.

## Blaze asset refresh (2026-10-22)

- All of Blaze's animated strips rebuilt from a new source drop ("Blaze animation png sequence",
  319MB, not checked into this repo) via the updated `scripts/build_blaze_stretch_strips.py` -
  `SRC_ROOT` now points there instead of the old "Blaze assets library" drop. Frame counts kept
  identical to before (48 idle, 24 hiphop, 48 hello/neck [24+24], 4 per map run direction, 15 for
  "up") so no frontend logic changed, just the art.
- **Map run cycles are real now**: the old `blaze-map-run-{up,down,left,right}.png` were hand-cut (no
  build script ever existed for them, SESSION_NOTES just called it out as such) - the new source's
  "Blaze running png sequence" folder has an actual 18-frame run cycle per direction (front/back/left/
  right, plus unused 45° diagonals and top views), sampled down to the existing 4/15-frame counts.
  `blaze-map-run-up-left.png` / `-up-right.png` stay as orphaned, unrebuilt leftovers - nothing imports
  them (TerritoryMap.jsx only ever used 4 quadrants).
- **Pose source mapping** (new source has no exact folder-name match for some old picks):
  idle → "Arm stretching" alone (was "Shoulder stretch" + "Arm Stretching" combined - no matching
  "Shoulder stretch" folder this time); hiphop → "break dance" (no "Hip Hop" folder); hello/neck →
  "waving" + "neck stretch" (direct match, just renamed from "Hello").
- Cell geometry drifted with the new art's proportions (profile strips only - map strips are always
  exactly 128x170 via contain-fit, unaffected): idle's `frameWidth` 200→151, hiphop's 230→233 (both
  `src/utils/heroSprites.js`), and HeroSprite.jsx's `CELL_ASPECT` 203/320→197/320. Re-run the script
  and check its printed `cell=` line before trusting these if the source art changes again.

## Emotes: new buyable poses, and a perf pass on all of them (2026-10-26)

- Added a central emote registry (`src/utils/emotes.js`) + `EmoteGlyph.jsx` - the only place any
  screen turns an EMOTE StoreItem into a picture (StoreItem.assetUrl is never populated for EMOTE
  rows). "Classic" (the one free emote every hero already has, migration V1_64) now renders the
  hero's **idle** pose; "Hip Hop" is a new standalone buyable emote using the hiphop/"signature
  dance" strip; Breathing/Checking Shoes/Jumping Jack/Shoulder Rub/Squat/Victory are newly-built
  dedicated emote art (Comet has no Breathing/Checking Shoes folder, one fewer than Blaze). None of
  these are purchasable yet - no backend EMOTE row exists for them beyond "Classic". New admin tool
  **`EmoteAdminPanel.jsx`** (`/admin/game-mechanics` → "Emotes") creates them via the backend's
  existing `POST /v1/store/admin/items` (same pattern `HeroAdminPanel.jsx` already used for Heroes).
- **Blaze's "idle" source changed**: the asset drop's own `breathing` folder was renamed to `idle`
  (same 235 frames) to give Blaze a dedicated idle source like Comet already had, instead of reusing
  `Arm stretching`. This is a shared asset - it now also changes the look of the Shop hero card's
  default pose, the Hero Detail Modal, the map marker's idle animation, and the Me-tab turntable, not
  just the new "Classic" emote. `Arm stretching` is unused now.
- **Performance fix - the actual root causes of "the emote lags in Me/Emotes"**, found by measuring
  (not guessing) asset weight and render behavior, in order of impact:
  1. The idle/hiphop/emote sprite strips were lossless PNG built at a flat 320px cell height
     regardless of where they're ever shown on screen (EmoteGlyph's biggest caller is the 140px buy
     popup) - 1-2.8MB files decoding to 5-12MB raw RGBA bitmaps each. Fixed: emote-only art
     (`EMOTE_CELL_H` in both `build_*_stretch_strips.py`) now builds at 190px instead of 320, and
     every profile-sized strip (idle/hiphop/emotes) saves as WebP instead of PNG
     (`WEBP_QUALITY = 82`). ~19.5MB of emote/profile PNGs across both heroes is now ~2.7MB of WebP -
     most individual files went from 1.1-2.8MB to 110-270KB. `blaze/comet-profile-hello-neck-stretch.png`
     (another ~5MB) turned out to be completely dead - nothing imports them since HeroSprite.jsx
     switched to the shared idle pose - deleted outright.
  2. The Shop's Emotes grid played every tile's animation continuously and simultaneously, whether
     or not it was the one being looked at - `EmoteGlyph` now starts paused (a real static first
     frame, not a mid-animation freeze) and only plays when `active` (the buy/showcase popup, the
     one deliberately-selected instance) or while hovered/focused inside the grid
     (`EmoteGlyph.css`). On mobile (no hover), this means the grid itself stays static and only the
     opened popup animates - matches "only the selected/visible one" either way.
  3. GamePage's standing GPS watch (`liveLocation`, independent of whether a run is being tracked)
     re-renders the whole page every few seconds regardless of which tab is open. `emoteItems`/
     `skinItems`/`shadeItems`/`trailItems`/`galleryHeroes` were plain inline `.filter()` calls (a new
     array identity every render) and `handleEquip` was a plain function (a new identity every
     render) - both defeated any attempt to skip re-rendering the Shop grid on an unrelated tick.
     Now memoized (`useMemo`/`useCallback`), and `EmoteShelf`/`HeroItemShelf` are wrapped in
     `React.memo`, so an unrelated GPS-driven re-render of GamePage no longer cascades into
     re-rendering every emote tile.
  - Not changed: `HeroSprite.jsx`'s own 150ms rAF-driven re-render (that's the Me-tab turntable's
    actual animation mechanism, not waste) and the map marker's run-cycle sheets (map_out, a
    different consumer than Me/Emotes, already reasonably sized before this pass).

## Fortnite-style Emotes, leaderboard polish, and Run/Defend This Territory (2026-10-27)

- **Emotes screen, Fortnite-locker redesign**: `EmoteSelectScreen.jsx` (+ `.css`) replaces the plain
  grid once a hero's emotes are open (`HeroItemShelf.jsx`'s new `renderGrid` override - only when the
  hero itself is owned; `SkinShelf.jsx` is untouched, it never passes this prop). Yellow "SELECT
  EMOTE" header tab, a left detail card (rarity | EMOTE, name, description, big thumbnail) + the tile
  grid below it, a big pedestal preview on the right (stacks above the grid on mobile). Tapping/
  arrow-navigating a tile only SELECTS it (updates the card/preview instantly); tapping the pedestal
  or the detail card's own button is what opens the full-screen showcase (item 2 below) - kept as two
  separate steps so keyboard/grid browsing never accidentally pops a purchase screen.
  - **Rarity and description are both invented client-side** (`utils/emoteRarity.js`) - neither
    exists on the backend's StoreItem (no rarity or description column). Rarity is a price-banded
    tier (free=Common, <200=Rare, <500=Epic, else=Legendary) purely for the border color/label;
    description is a hand-written flavor line per known emote name, generic fallback otherwise.
    Purchase/equip logic never reads either - still 100% priceFahhcoin-driven.
  - **"NEW" badge** (`utils/seenEmotes.js`) is a per-browser localStorage set too - StoreItemResponse
    has no createdAt. First visit after an emote's added marks it new; next visit it isn't.
- **Showcase screen** (`EmoteShowcase.jsx` + `.css`): full-screen pedestal view with name/rarity up
  top, a Preview button (remounts EmoteGlyph via key to replay the already-infinite-looping
  animation from frame 1), Equip/Unequip or Buy/Get-Fahhcoin, and the close/Esc/backdrop-click
  GamePage already had on `storeChoice`. This REPLACES the old shared buy-confirm card for EMOTE
  specifically - GamePage.jsx's `storeChoice` modal now branches EMOTE into `<EmoteShowcase>` and
  everything else (SKIN/TERRITORY_SHADE/TRAIL_COLOR) into the original small card, which also lost
  its now-dead "already owned" branch (those categories only ever reach it unowned - an owned tile
  equips directly on tap, see SkinShelf.jsx/ColorShelf.jsx).
- **Leaderboard**: mostly already matched the "CoC-chunky, rank medals, highlighted row, podium"
  brief from earlier work this branch - added what was actually missing: a real loading state
  (`LeaderboardSkeleton` in `LeaderboardPodium.jsx` - without it, the empty-state text showed
  briefly on every first load since the array is empty before the request lands), `role="tab"`/
  `aria-selected` on both segmented controls, and a 44px tap-target floor on the Global/District
  and Global/Country scope toggle specifically (`.game-menu-subtabs-scope .game-menu-subtab` - this
  class has no other consumer, so it didn't touch any other screen's subtabs).
- **Territory click → run points + "Run/Defend This Territory"**: `handleParcelClick`/
  `handleViewMyParcel` (GamePage.jsx) now also capture the owner's equipped-Hero avatar, a run
  score, and the full boundary polygon onto `highlightedEntry`, and the popup grew an avatar (with
  its own broken-image fallback to colored initials - `TerritoryAvatar`, unlike most other
  broken-asset spots in this app which just vanish, since a popup that's otherwise just "X's
  territory" reads as broken with a blank gap where a face should be), a run-score stat, and the
  run/defend button.
  - **Owner avatar and run score were already in the API response, just dropped on the way to the
    map** - `TerritoryParcelResponse.ownerEquippedItems` (every equipped item, not just shade/emoji)
    and `.currentScore` both existed server-side; `toDisplayParcel` (`utils/territoryGame.js`) just
    never kept them. Now it does (`ownerAvatarUrl`, `currentScore`).
  - **"Total run points" is NOT a real total** - `TerritoryParcel.currentScore` is a per-parcel
    score (what the conflict-resolution engine compares a challenger's score against), not a
    player-wide figure anywhere on the backend. The popup sums `currentScore` across whichever
    parcels make up the tapped (merged) shape and labels it "run score" rather than overclaiming a
    lifetime total. An actual all-parcels total for arbitrary players would need a new backend
    field - e.g. `TerritoryProfileResponse.totalRunScore` (Double = SUM(currentScore) over every
    ACTIVE TerritoryParcel WHERE owner_id = :userId), the same home `totalAreaSqMeters` already
    lives in, exposed through the existing `/v1/territory/profile`/`/v1/territory/profile/{userId}`
    endpoints (no new endpoint needed, just a new field + query).
  - **Route generation** (`generateTerritoryLoopRoute`, `utils/territoryGame.js`): rotates the
    territory's own boundary ring to start at whichever point is nearest the player right now,
    keeps the ring's existing winding direction (no separate "pick a direction" heuristic), and
    closes the loop - then feeds straight into the exact same `viewingRoute`/`followingRoute`/
    `getRouteGuidance` machinery a saved "Run This Route" already uses (`handleRunViewedRoute`) -
    nothing about running a generated loop is handled differently from a saved one.
  - Warns (with a "Continue anyway" / Cancel step, not a blocking dialog) on a loop over 10km or
    under 40m, and surfaces "Start point is Xm away" inline when it's a meaningful walk to the start
    - the guide's own off-route steering already points the runner there once the run begins, so
      this is informational, not a separate "navigate there first" mode.
  - `routeNav.js`'s shared `OFF_ROUTE_METERS` tightened 60m→30m (the spec's own number) - this is
    shared by every guided run, not territory-only, since parameterizing it per route source would
    have meant duplicating the guidance function instead of reusing it.
  - `RouteTurnIndicator.jsx` gained an optional `totalDistanceMeters` prop and now shows "X% done"
    alongside the existing distance-remaining text, for every guided run (not territory-specific).
  - A new `routeAnchorPoint` prop on `TerritoryMap.jsx` shows a single 🏁 start/finish pin for
    whichever route is being previewed or run - one pin, not two, since every route in this game is
    a closed loop (a territory claim requires one), so start and finish are the same point.
  - **Verified live against the running dev server** (an already-open, already-authenticated tab -
    see below) that tapping a real territory shows the correct name/area/run-score and the
    distance-to-start hint, with real backend data (not a mock). Button text/warnings/keyboard nav
    on the Emotes screen, actually starting and running a generated loop, and the explicit mobile-
    width check were **not** verified interactively - a full top-level page reload mid-session
    logged the tab out (session wasn't cookie-persisted across a fresh load) and no credentials
    exist to sign back in. `npm run lint`/`npm run build` both pass clean throughout.

## Vehicle detection (anti-cheat) for runs (2026-10-28)

Adds a client-side, real-time vehicle/bike detector to `useRunTracker` so distance/territory
credit pauses the moment a run looks vehicle-assisted, instead of only catching it after the fact
server-side. **This is additive, not a replacement** for the backend's own after-the-fact
re-validation (`TerritoryAntiCheatValidator`, `TerritoryProcessingServiceImpl` in the backend repo
`~/Documents/FahhKit`) - that already independently recomputes from the raw submitted points and
rejects territory processing (`CHEAT_DETECTED`) on `avgSustainedSpeed > 12.0 m/s` or
`>30%` of segments violating, regardless of anything the client reports. The two numbers were
picked to agree on purpose (`VEHICLE_SPEED_MS = 12`, `VEHICLE_RUN_INVALID_RATIO = 0.3` in
`src/constants/antiCheat.js` match `TerritoryAntiCheatProperties.maxSustainedSpeedMetersPerSecond`/
`.maxSustainedSpeedViolationRatio`).

- **`src/constants/antiCheat.js`** — every threshold, named (`VEHICLE_SPEED_MS`, `SUSPECT_SPEED_MS`,
  `MIN_CADENCE_HZ`, `WINDOW_SECONDS`, `ACCURACY_LIMIT_METERS`, `RESUME_SECONDS`, etc.) plus the
  accessibility-mode multiplier and two localStorage keys.
- **`src/utils/vehicleDetection.js`** — the actual state machine (`RUNNING → SUSPECT → VEHICLE`,
  hysteresis both ways), zero React/DOM imports on purpose (same philosophy as the backend's own
  `TerritoryAntiCheatValidator` - directly unit-testable with hand-built traces, no mocking a hook
  or the DOM). Combines rolling-window speed (blends `coords.speed` with computed distance/time
  speed), accelerometer-peak step/cadence detection (moved out of `useRunTracker`'s old inline
  version), and two pattern checks (suspiciously constant speed, GPS-jump/teleport rejection).
  Tunnels/signal drops (`GAP_SECONDS` gap) are discarded from evidence without resetting whatever
  state was already building. `compressSegments()` merges the per-fix flag log into runs before
  it's sent with the run, so a long run doesn't balloon the payload.
  - `src/utils/vehicleDetection.test.js` — Vitest (newly added as a devDependency + `npm test`/
    `npm run test:watch` scripts, and `vitest.config.js` - there was no test runner in this
    frontend before this) unit tests with simulated traces: walking/running/sprinting (never
    flag, including a brief sprint spike that shouldn't sustain into SUSPECT), cycling/car-in-
    traffic/car-on-highway (all caught), a single GPS jump and a tunnel-length dropout (both
    discarded, not penalized), resume-after-VEHICLE, dispute(), and accessibility mode (tolerates
    higher hand-cycle speed with zero cadence, still catches genuinely vehicle-level speed).
- **`src/utils/antiCheatSettings.js`** — localStorage/URL glue kept separate from the pure detector
  module: `isAccessibilityModeEnabled`/`setAccessibilityModeEnabled` (TEMP, local-device-only -
  there's no backend field for this preference yet, see the backend spec below for the hook a real
  per-user preference would plug into) and `isAntiCheatDebugEnabled` (`?debug=anticheat` URL param,
  remembered in localStorage so a real-phone field test only needs the URL once; `?debug=off`
  clears it).
- **`src/hooks/useRunTracker.js`** — the old one-shot `invalidMotion` (warn-only, never paused
  anything) is gone, replaced by `vehicleState`/`vehicleReason`/`suspectDismissed`/`dismissSuspect`/
  `disputeVehicle`/`getDebugInfo`. Every accepted GPS fix is fed to the detector; a segment the
  detector returns as `excluded` (VEHICLE state, or a GPS jump) is left out of `distanceRef`
  entirely rather than just flagged after the fact. `stop()`'s result gains `segments` (compressed
  flag log), `vehicleExcludedMeters`, `vehicleSuspiciousRatio`, `isVehicleInvalid` (ratio over 30%),
  `maxSpeedMps`, `avgSpeedMps`, `stepCount`, `disputes` - all persisted into the existing
  `saveActiveRun()` localStorage record too, so a "Retry Save" after reopening the app still carries
  them. **Known limitation**: the detector's own state machine is NOT persisted across a page
  refresh mid-run (only points/distance already were) - a resumed run's anti-cheat tracking restarts
  clean from RUNNING. Accepted as a reasonable gap given how rarely a mid-run refresh happens and
  that the backend's own after-the-fact check still applies regardless.
- **`src/components/TrackRunPanel.jsx`** / **`src/pages/GamePage.jsx`** (both consume the same hook,
  no duplicated detection logic) — SUSPECT renders a dismissible, non-blocking banner ("Moving fast
  — are you in a vehicle?"); VEHICLE renders a blocking-looking but auto-recovering banner ("Vehicle
  detected — distance paused...") with an "I'm not in a vehicle" dispute button (logs the dispute,
  resumes immediately, but doesn't erase already-flagged segments - sustained evidence re-trips it
  if it keeps coming). A run with `isVehicleInvalid` (>30% vehicle-excluded distance) blocks the
  normal auto-submit with a friendly "Mostly vehicle, not legs 🚗" message and Discard/"Save Anyway"
  buttons (mirrors the existing too-short/too-fast warm-up pattern) rather than silently submitting
  or silently discarding - forcing it through still goes to the backend, which decides for real.
  GamePage's existing `CHEAT_DETECTED` → "Whoa there, speedster 🛵" rejection copy
  (`RUN_REJECTION_COPY`) already covers the backend's own after-the-fact rejection path, so nothing
  new was needed there. Both components also gained a "Wheelchair / Hand-Cycle Mode" settings toggle
  (raises speed ceilings, skips stride detection entirely - GamePage's lives in the existing
  Settings tab next to Visibility/Sound) and, behind the debug flag, `VehicleDebugOverlay` (live
  speed/avg-speed/cadence/state, bottom-left, polled every 500ms).
- **`src/api/runs.js`** `createRun()` — no signature change, just documents the new optional fields
  callers may include on the same POST payload (see backend spec below).

### Not implemented client-side (called out explicitly, not silently skipped)

- **Road-snapping check** ("positions snapped onto a road at a sustained speed faster than running
  pace") - would need a routing/map-matching API call per point, too expensive to do live client-
  side with what's available here. The existing speed+cadence+pattern signals cover the same cheat
  vector in practice (a car on a road is still just "fast, no cadence, often constant speed").
- A numeric countdown on the VEHICLE banner for when auto-resume will re-check - it resumes
  silently once `RESUME_SECONDS` of valid running+cadence holds, no visible timer.

### Backend spec (NOT implemented — backend is the sibling repo `~/Documents/FahhKit`, never edited

or compiled from this session; this is the exact handoff)

The security boundary already exists and needs no change: `TerritoryProcessingServiceImpl.java`
(~line 83) already calls `TerritoryAntiCheatValidator.isSustainedSpeedPlausible(...)` with
`TerritoryAntiCheatProperties.maxSustainedSpeedMetersPerSecond = 12.0` and
`.maxSustainedSpeedViolationRatio = 0.3`, independently recomputed from the raw submitted points,
and already rejects with `RunProcessingOutcomeConstant.CHEAT_DETECTED` + an automatic `FraudFlag`
(`FraudFlagSourceConstant.AUTO_RUN_CHEAT`) on violation. **Never make that check trust the new
client fields below instead of its own recomputation** - they're for moderator audit/context only.

What's actually missing is persisting the client's own telemetry so `FraudFlagsPage`'s moderator
review queue can see "what the runner's phone reported" alongside the server's own verdict,
especially dispute history (a player repeatedly tapping "I'm not in a vehicle" is itself a signal
worth a moderator seeing):

1. `RunCreateRequest.java` (`controller/request/`) — add, all optional (`@NotNull` omitted, a run
   with no client could still predate this):
   ```java
   private List<RunSegmentFlagRequest> segmentFlags; // see below
   private Double maxSpeedMps;
   private Double avgSpeedMps;
   private Integer stepCount;
   private Double vehicleSuspiciousRatio;
   private Boolean clientFlaggedInvalid;
   private Integer vehicleDisputeCount;
   ```
2. New `RunSegmentFlagRequest.java` (same package), one per compressed segment
   (`src/utils/vehicleDetection.js`'s `compressSegments()` output):
   ```java
   private Long fromTimestamp;
   private Long toTimestamp;
   private Double distanceMeters;
   private String kind; // "running" | "suspect" | "vehicle" | "gap" | "jump"
   private Boolean excluded;
   ```
3. Persist these onto the `Run` entity (or a new `RunClientTelemetry` child table if keeping `Run`
   lean matters more here) and surface them in `ModeratorRunController`'s run-detail response
   (`getModeratorRunDetail`, already consumed by `FraudFlagsPage.jsx`'s run-detail drill-down) -
   e.g. a "Client reported: 18% vehicle-excluded, 2 disputes" line next to the existing peak-speed
   stat there.
4. Optional, not required for correctness: if `vehicleDisputeCount` is high across a player's
   history, that's a reasonable input to `FraudFlagService`'s existing manual-flag/review weighting
   - left as a suggestion, not a spec, since that's a moderation-policy call.
5. **Accessibility mode hook**: there's no backend field for a per-user accessibility preference
   today (`src/utils/antiCheatSettings.js`'s toggle is a local-device-only localStorage flag, TEMP).
   If this becomes a real per-user setting, it'd most naturally live as a new boolean on whatever
   entity holds athlete profile preferences, read by `RunController`/`TerritoryProcessingServiceImpl`
   to loosen the server-side thresholds the same way the client raises its own - but doing so changes
   the _server's_ trust boundary (a malicious client could otherwise just always claim accessibility
   mode), so this needs real per-user state, not a request field.
