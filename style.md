# Run Conquest — Visual Style Guide

**"Frost & Amethyst"**: a professional, premium mobile-game look. Deep night-indigo surfaces,
sky blue as the brand/primary colour, clean white "frost" cards for readable content, violet for
premium/rare, green only for go/success, red only for danger, gold **only** for coins, trophies,
and the rank-1 crown/podium.

Applied to: the entire `/game` feature (`GamePage`, `TerritoryMap`, the Shop/Club/PvP/Mail/
Leaderboard panels, the in-game auth screens) — not the rest of the site.

This replaces the earlier "warm wooden war-table" palette (wood/stone/gold-as-primary). That
palette is gone; do not reintroduce orange, yellow, or brown as a surface, button, panel, header
ribbon, tab, or border colour anywhere in `/game`.

## Non-negotiable rules

1. **Gold is ONLY for coins, trophies, and the rank-1 crown/podium.** Nothing else — not primary
   buttons, not active tabs, not "selected" highlights. Those all use sky.
2. **Sky is the brand/primary colour.** Primary actions (Play, Run This Territory, Sign In, Equip,
   Request Rollout), active tabs, focus rings, "this is you"/"selected" highlights.
3. **Violet is for premium/rare context only** — epic/legendary rarity, Club Wars, special offers.
4. **Green is for success/go only** — "Yes, End", claimed, owned, completed. Never a generic accent.
5. **Red is for danger only** — close (X), discard, delete, errors, the vehicle-detection warning.
6. **No orange or brown as a surface, button, panel, ribbon, tab, or border colour**, anywhere.
   (Team/territory colours are the one exception — see below — because a categorical palette needs
   wide hue variety to stay distinguishable; even there, a muddy brown is avoided.)

## Tokens (`src/game/styles/tokens.css`, scoped to `.game-root`)

This file is the **only** place a hex colour may appear in `/game`. Every component/page reads a
`var(--token)`, never a literal hex. A small number of JS files that feed non-CSS rendering
(Leaflet/MapLibre paint options in `TerritoryMap.jsx`, the deterministic owner-colour palette in
`territoryGame.js`) carry literal hex values that must stay in sync with this file by hand — each
is commented with which token it mirrors.

| Group          | Tokens                                                                 | Use                                                                                            |
| -------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Ink            | `--ink`                                                                | Outlines, borders, text strokes, shadows                                                       |
| Surfaces       | `--bg-900` / `--bg-800` / `--surface-700` / `--surface-600` / `--line` | App background → panel body → raised surface → dividers                                        |
| Frost          | `--frost-50/100/200` / `--frost-ink`                                   | Light readable cards, their text                                                               |
| Sky            | `--sky-300/500/700/900`                                                | Brand, primary action, active tab, focus ring, "this is you"                                   |
| Violet         | `--violet-300/500/700/900`                                             | Premium, epic/legendary rarity, Club Wars                                                      |
| Green          | `--green-300/500/700`                                                  | Success/go only                                                                                |
| Red            | `--red-300/500/700`                                                    | Danger only                                                                                    |
| Gold           | `--gold-300/500/700`                                                   | Coins/trophies/rank-1 **only**                                                                 |
| Text           | `--text` / `--text-muted` / `--text-on-frost` / `--text-link`          |                                                                                                |
| Rarity         | `--rarity-common/rare/epic/legendary`                                  | Item rarity borders/glow                                                                       |
| Team/territory | `--team-coral/tangerine/lime/emerald/cyan/indigo/magenta/slate`        | 8-colour, CVD-leaning-safe categorical set for other players' territory on the map/leaderboard |

Full scales (radius/border/space/type/z-index/motion) are documented inline in `tokens.css`.

## Typography (`src/game/styles/fonts.css`)

Readable first, playful second.

- **Display** (headings, buttons, numbers, tabs): Fredoka 500/600/700, self-hosted via
  `@fontsource`.
- **Body** (paragraphs, labels, inputs, mail, chat): Nunito 600/700/800, self-hosted.
- Minimum 14px anywhere; body defaults to 16px; 13px only for all-caps labels with `+0.04em`
  letter-spacing.
- Line-height 1.35 body / 1.15 headings.
- **No heavy text stroke below 20px.** A 2px ink outline (`.text-outlined`) is reserved for
  headings ≥20px and numbers on bright backgrounds. Everything else gets a plain `0 1px 0
rgba(0,0,0,.35)` shadow at most.
- `font-variant-numeric: tabular-nums` (`.tabular-nums`) for score, distance, time, pace, coins.

## Button recipe (`src/game/ui/GameButton.jsx` + `components.css`)

3-stop vertical gradient (300 → 500 at 55% → 700), 3px `--ink` border, radius 14px, a top inner
highlight (`inset 0 2px 0 rgba(255,255,255,.4)`), a bottom inner shade (`inset 0 -3px 0
rgba(0,0,0,.25)`), a hard drop (`0 4px 0 var(--ink)`), pressed = `translateY(3px)`.

Default/md/lg buttons use **ink-coloured text at 20px+/700-weight** (not white, no stroke) — sized
specifically to legitimately clear WCAG's "large text" 3:1 threshold on every gradient variant's
500 stop, verified in the automated contrast table (`/game/style-guide`). `danger` is the one
exception (white text, which clears AA on red-500). `gb-sm` (16px) is a known, documented gap for
`variant="premium"` only — avoid that specific combination.

Variants: `primary` (sky), `success` (green, go/confirm only), `premium` (violet), `danger` (red),
`secondary` (a frost card — not a gradient), `ghost` (transparent, sky text).

## Panels/modals/tabs

- Panel: `--bg-800` body, `--surface-700` inset border, 3px `--ink` border, radius 20px.
- Modal: same, plus a header ribbon in a sky (default) or violet (`premium` prop) gradient — never
  orange — and a red round close button.
- Tabs: inactive `--surface-600`; active = a sky gradient (or violet, `premium` prop) anchored on
  its 700 stop with white text, which is what clears AA (not the 500 stop alone).

## WCAG AA

`/game/style-guide` (dev-only route) renders an **automated** contrast table from
`src/game/styles/contrast.js` for every real text/background pair the component library produces.
Keep it green — add a pair there whenever a new text/background combination is introduced, and fix
real failures by either genuinely passing on fill colour alone (preferred — see the button recipe
above) or, only where unavoidable, documenting the mitigation (e.g. the mandatory ink stroke on
button labels) directly in the table rather than silently leaving a bare fail.

## Fonts/tokens setup notes

- `@fontsource/fredoka` and `@fontsource/nunito` are npm dependencies — self-hosted, not Google
  Fonts CDN, same offline-reliability reasoning as the project's other self-hosted assets.
  `@fontsource/noto-sans-devanagari` is the fallback for any Nepali-script text (club names, mail).
- `useGameFontPreload()` (`src/game/styles/useFontPreload.js`) preloads the Fredoka 600 woff2 —
  call it once from whichever game entry mounts first.
- `.game-root` is added alongside the existing `.game-page` class on `GamePage`'s root element(s).
  Both classes target the exact same DOM node — `.game-page` still carries the old `--game-*`
  custom properties (now aliases onto the tokens above, not raw hex — see the comment block at the
  top of `GamePage.css`), `.game-root` carries the new token set directly. Any new /game code
  should read the new tokens directly; the `--game-*` aliases exist for backward compatibility with
  code that hasn't been touched yet, not as a pattern to keep extending.
