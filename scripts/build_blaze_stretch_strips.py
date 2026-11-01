"""Builds Blaze's sprite pack straight into src/assets/heroes/blaze/ (idle
pose, map marker idle+run, and a densely-numbered emote1../manifest.json),
from the unified "/home/jozan/Documents/Characters/<Hero>/" asset drop (not
checked into this repo, ~2.6GB across all 7 heroes) via the shared
_sprite_strip_lib.py - see that module's own docstring for the crop/sample/
strip mechanics and the numbered-emote rationale.

Blaze already had named emote keys (victory/checking_shoes/hip_hop/...)
matched against real, already-purchased backend EMOTE StoreItem rows (see
src/utils/emotes.js's resolveEmoteAsset) - renumbering to emote1/emote2/...
here, same as the other 6 heroes, means those rows need a matching name
update server-side (not done by this script - see the asset-refresh
handoff note) or their art goes blank for anyone who already owns one.
Chosen anyway for one scheme across all 7 heroes instead of 3 different
naming conventions, per explicit instruction (2026-11-02 asset-refresh
task).

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
