# Territory Run — Visual Style Guide

Minimal Clash-of-Clans-inspired cartoon style.

- Chunky, rounded shapes with thick soft outlines (dark brown or dark navy, not pure black).
- Warm, slightly saturated color palette: earthy greens, wood browns, stone greys, gold accents.
- Simple cel-shading — one core color plus one shadow tone per shape. No complex textures or gradients.
- Bold, readable silhouettes at small sizes.
- Buttons and UI panels look like carved wood or stone slabs: a beveled edge (light top highlight,
  darker bottom edge), kept simple — no ornate borders or clutter.
- Icons are chunky and simplified, like mobile strategy-game resource icons (gold, gems, elixir
  style), with a subtle drop shadow beneath each element for depth.
- Avoid busy detail, fine linework, or photorealistic shading. The goal is "friendly, tactile,
  low-detail cartoon," not "richly painted illustration."

Applied to: buttons, resource icons, building sprites (territory badges), HUD elements — scoped to
the Territory Run game (`GamePage`, `TerritoryMap`), not the rest of the site.

## Palette (defined as CSS custom properties on `.game-page`, inherited by every game element)

| Token                                                       | Hex                               | Use                                                                     |
| ----------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| `--game-ink`                                                | `#3d2b1a`                         | Thick outlines, borders, drop shadows — warm dark brown, not pure black |
| `--game-wood` / `--game-wood-dark` / `--game-wood-light`    | `#c98f52` / `#9c6a34` / `#e8c084` | Neutral wood-slab buttons and panels                                    |
| `--game-stone` / `--game-stone-dark` / `--game-stone-light` | `#9a9d93` / `#6e7166` / `#c4c7bc` | Utility controls (exit, locate, zoom) — carved stone slabs              |
| `--game-gold` / `--game-gold-dark` / `--game-gold-light`    | `#f4c430` / `#c4900c` / `#ffe08a` | Primary action, coin resource, player color                             |
| `--game-green` / `--game-green-dark` / `--game-green-light` | `#6fa15e` / `#46733a` / `#a4cf8e` | Parcels/territory resource, earthy accent                               |
| `--game-cream`                                              | `#f6ecd9`                         | Warm off-white for text on dark panels                                  |
| `--game-panel`                                              | `rgba(44, 32, 20, 0.9)`           | Flat dark wood-brown panel background (HUD pills, drawers, toasts)      |

Cel-shading recipe used throughout: a flat base color plus one hard-edged inset shadow band
(`box-shadow: inset 0 -Npx 0 <dark tone>`) for the shaded half, and a chunky solid offset drop
shadow (`box-shadow: 0 Npx 0 var(--game-ink)`) beneath the whole shape — never a blurred gradient.

## Colour revert note (2026-10-30)

A later pass briefly replaced this whole palette with a "Frost & Amethyst" indigo/sky/violet
system. That's been reverted — the wood/gold palette above is what's actually in `.game-page`
again. Two things were deliberately left on the newer palette and were NOT reverted:

- The loading/splash screen (`.game-loading-overlay` and its descendants in `GamePage.css`) —
  still reads `var(--bg-900)`/`var(--sky-*)` from `src/game/styles/tokens.css` directly.
- The intro globe reveal (`GameIntroGlobe`) — was never tokenized either way; its blue
  atmosphere is MapLibre's own globe-projection sky.

`src/game/styles/tokens.css` and `src/game/ui/*` still exist and are still imported — they now
only feed those two spots plus the rollout-request popup (`RolloutRequestModal`/
`RolloutRequestedChip`) and the dev-only `/game/style-guide` page, not the rest of the game.

Non-colour changes from that same pass were kept as-is: the Fredoka (headings/buttons/numbers)
and Nunito (body) self-hosted fonts (`src/game/styles/fonts.css`), replacing the old self-hosted
Passion One — and the Territory Rollout request popup/chip.
