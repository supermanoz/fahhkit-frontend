"""Builds Cyclone's MAP MARKER pack only (see build_blaze_stretch_strips.py's docstring - profile/emotes moved to build_emote_sheets.py) straight into src/assets/heroes/cyclone/ -
a brand new manifest (Cyclone had no bundled art before this), so no
backend rename is needed for this one. See build_blaze_stretch_strips.py's
docstring for the shared mechanics (unified source drop, WebP-width-capped
frame sampling, numbered-emote scheme).

Usage: `python3 build_cyclone_stretch_strips.py`. Requires Pillow.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _sprite_strip_lib import build_hero_pack  # noqa: E402

SRC_ROOT = "/home/jozan/Documents/Characters/Cyclone"
OUT_ROOT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "src", "assets", "heroes", "cyclone",
)

if __name__ == "__main__":
    build_hero_pack("cyclone", SRC_ROOT, OUT_ROOT)
