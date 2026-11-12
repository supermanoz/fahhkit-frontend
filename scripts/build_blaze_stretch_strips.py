"""Builds Blaze's MAP MARKER pack only (map/idle.png + map/run.png, the
continuously-moving overlay on the live territory map) straight into
src/assets/heroes/blaze/, from the unified
"/home/jozan/Documents/Characters/<Hero>/" asset drop (not checked into
this repo, ~2.6GB across all 7 heroes) via the shared _sprite_strip_lib.py
- see that module's own docstring for the crop/sample/strip mechanics.

Profile idle + every numbered emote (the thing this script used to also
build, as single-row resized/downsampled WebP strips under profile/ and
emotes/) moved to scripts/build_emote_sheets.py as of the 2026-11 emote
rebuild - lossless multi-sheet packs under sheets/, no frame-dropping or
resizing, driven by the same numbered-emote scheme
(victory/checking_shoes/hip_hop/... all still renumbered to
emote1/emote2/... for one scheme across all 7 heroes, per the original
2026-11-02 asset-refresh task this script's own history started from).
This script only ever touches map/ now.

Usage: `python3 build_blaze_stretch_strips.py` (no per-set args, unlike the
old script - every category found under SRC_ROOT is built in one pass).
Rerun by hand if the source drop changes. Requires Pillow.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _sprite_strip_lib import build_hero_pack  # noqa: E402

SRC_ROOT = "/home/jozan/Documents/Characters/Blaze"
OUT_ROOT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "src", "assets", "heroes", "blaze",
)

if __name__ == "__main__":
    build_hero_pack("blaze", SRC_ROOT, OUT_ROOT)
