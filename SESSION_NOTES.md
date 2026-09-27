# Territory Run — Session Notes

Working log of feature work on the Territory Run game (`GamePage`, `TerritoryMap`), kept so a
future session (Claude or otherwise) can get oriented quickly without re-reading the whole diff.
Update this as work continues rather than starting a new file each time. Git history/commit
messages have the precise diffs — this is the "why" and "what's still open" that doesn't show up
in a `git log`.

Last updated: 2026-09-21, branch `RUN_CONQUER`, latest commit `f69c7be`.

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
