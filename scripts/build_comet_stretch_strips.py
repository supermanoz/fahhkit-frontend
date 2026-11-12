"""Builds Comet's MAP MARKER pack only (see build_blaze_stretch_strips.py's docstring - profile/emotes moved to build_emote_sheets.py) straight into src/assets/heroes/comet/ - see
build_blaze_stretch_strips.py's docstring for the shared mechanics/
rationale (unified source drop, WebP-width-capped frame sampling,
numbered-emote scheme, and the backend StoreItem rename this implies for
Comet's already-named/already-purchased emotes).

Usage: `python3 build_comet_stretch_strips.py`. Requires Pillow.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _sprite_strip_lib import build_hero_pack  # noqa: E402

SRC_ROOT = "/home/jozan/Documents/Characters/Comet"
OUT_ROOT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "src", "assets", "heroes", "comet",
)

if __name__ == "__main__":
    build_hero_pack("comet", SRC_ROOT, OUT_ROOT)
