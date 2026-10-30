# Territory Run — Visual Style Guide

Clash-of-Clans-inspired cartoon style: whitish/light-grey panels, black/near-black ink, green as
the default button colour, red for danger, gold reserved for coins/trophies/rank-1 only
(2026-10-30 — this replaces the earlier wood/gold palette below).

- Chunky, rounded shapes with thick 2-3px black outlines.
- Panels/menus/modals/cards are fully solid, no transparency: off-white body, slightly darker
  inset rows, light-grey dividers.
- Headings and button labels: white fill, 2px black stroke (`-webkit-text-stroke`), small dark
  drop shadow — reads on any button colour. Plain body text/labels: ink-coloured directly, no
  stroke.
- Buttons: a 3-stop vertical gradient (light → mid → dark), 2-3px black border, a top inner
  highlight, a hard bottom drop shadow, pressed = moves down 2-3px. Secondary buttons are flat
  white/light-grey with a black border and ink text (no stroke). Close/danger buttons are red
  with a white X.
- Tabs: inactive = light grey, active = white (merges into the panel), ink text throughout.
- Icons are chunky and simplified, with a subtle drop shadow beneath each element for depth.
- Avoid busy detail, fine linework, or photorealistic shading.

Applied to: buttons, resource icons, building sprites (territory badges), HUD elements — scoped to
the Territory Run game (`GamePage`, `TerritoryMap`), not the rest of the site. Two things are kept
exactly as they were, not part of this palette: the loading/splash screen (`.game-loading-overlay`
and descendants in `GamePage.css` — still reads `var(--bg-900)` and a few literal hex values frozen
there on purpose) and the intro globe (`GameIntroGlobe` — was never tokenized, MapLibre's own
globe-projection sky).

## Tokens (`src/game/styles/tokens.css`, `.game-root`) — the one place every colour lives

| Token                           | Hex                               | Use                                                                                    |
| ------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------- |
| `--ink`                         | `#1a1a1a`                         | Borders (2-3px), body text, icons                                                      |
| `--panel`                       | `#f4f4f0`                         | Panel/menu/modal/card body                                                             |
| `--row`                         | `#e3e3dd`                         | Inset rows, dark-variant cards                                                         |
| `--divider`                     | `#cfcfc8`                         | Dividers, inset panel ring                                                             |
| `--white`                       | `#ffffff`                         | Secondary buttons, active tabs, heading/label fill                                     |
| `--tab-inactive`                | `#d9d9d3`                         | Inactive tab background                                                                |
| `--green-300` / `-500` / `-700` | `#8ee04a` / `#5cb82a` / `#3c8a18` | Default/primary button colour                                                          |
| `--red-300` / `-500` / `-700`   | `#ff6b5c` / `#e23b2e` / `#a82a1f` | Close/danger only                                                                      |
| `--gold-300` / `-500` / `-700`  | `#ffe07a` / `#ffc531` / `#c98a00` | Coins, trophies, rank-1 ONLY                                                           |
| `--gold-text` / `--green-text`  | `#8a5e00` / `#2f6e13`             | Darker text-only variants — `-700` itself fails AA as text on `--panel`/`--green-tint` |
| `--red-tint` / `--green-tint`   | `#fbe4e1` / `#e6f7d9`             | Pale error/success banner surfaces                                                     |
| `--text` / `--text-muted`       | `#1a1a1a` / `#5a5a54`             | Body text / secondary labels                                                           |

Shared button recipe (`--press-drop`, `--inner-highlight`, `--inner-shade` in tokens.css): 3-stop
gradient (300 → 500 at 55% → 700), 2-3px ink border, top highlight, bottom shade, hard drop
shadow, pressed = `translateY(3px)`.

`--game-*` (defined once on `.game-page` in `GamePage.css`) is an alias layer onto the tokens
above — the mechanism that retints the ~800 existing `var(--game-wood)`/`var(--game-gold)`/etc.
call sites across every `/game` CSS file from one place. `--game-gold` defaults to green (it was
always "primary action" under the old system) with a short, audited list of genuine currency/
medal/trophy selectors overriding it back to real gold.

## Known AA gap, by design

Button/heading labels use the white-fill + black-stroke treatment per the brief ("so they read on
any colour"), not fill-only contrast — measured as fill color alone (ignoring the stroke), white on
`--green-500` is 2.52:1, which would fail WCAG on its own. The 2px ink stroke is the actual
readability mechanism here, the same way a comic-book outline reads regardless of background; it
isn't captured by a plain luminance-ratio contrast check. Flagged here rather than silently
claiming a pass that a contrast tool run on fill color alone wouldn't confirm.

## Cel-shading recipe

A flat base color plus one hard-edged inset shadow band (`box-shadow: inset 0 -Npx 0 <dark tone>`)
for the shaded half, and a chunky solid offset drop shadow (`box-shadow: 0 Npx 0 var(--game-ink)`)
beneath the whole shape — never a blurred gradient.

## Earlier palette (superseded, kept for history)

Before this pass, the default was a warm wood/gold palette (`--game-ink: #3d2b1a`,
`--game-wood: #e0a355`, `--game-gold: #ff7a29`, `--game-green: #4fc85e`, `--game-red: #ff5a4d`,
`--game-cream: #fff6e6`), and before that briefly a "Frost & Amethyst" indigo/sky/violet system
(reverted on 2026-10-30, same day as this pass, before this one replaced it in turn). Only the
loading screen and the globe still carry anything from that indigo/sky/violet set today (the
`--bg-900` token specifically, nothing else).
