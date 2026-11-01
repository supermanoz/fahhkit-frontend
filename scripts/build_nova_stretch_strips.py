"""Builds Nova's sprite pack straight into src/assets/heroes/nova/ - a
brand new manifest (Nova had no bundled art before this), so no backend
rename is needed for this one. See build_blaze_stretch_strips.py's
docstring for the shared mechanics (unified source drop, WebP-width-capped
frame sampling, numbered-emote scheme).

Usage: `python3 build_nova_stretch_strips.py`. Requires Pillow.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _sprite_strip_lib import build_hero_pack  # noqa: E402

SRC_ROOT = "/home/jozan/Documents/Characters/Nova"
OUT_ROOT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "src", "assets", "heroes", "nova",
)

if __name__ == "__main__":
    build_hero_pack("nova", SRC_ROOT, OUT_ROOT)
