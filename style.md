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
