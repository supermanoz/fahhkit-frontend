"""Builds Phantom's MAP MARKER pack only (see build_blaze_stretch_strips.py's docstring - profile/emotes moved to build_emote_sheets.py) straight into src/assets/heroes/phantom/ -
a brand new manifest (Phantom had no bundled art before this), so no
backend rename is needed for this one. See build_blaze_stretch_strips.py's
docstring for the shared mechanics (unified source drop, WebP-width-capped
frame sampling, numbered-emote scheme).

Source folder is "/home/jozan/Documents/Characters/Phanton" (the artist's
own spelling) but the hero itself is "Phantom" everywhere else in this app
(backend Hero.name, StoreItem rows, isPhantomHero, etc. - see
src/utils/hero.js and SESSION_NOTES.md's "Limited heroes" entry) - `hero`
below is the corrected spelling; only SRC_ROOT keeps the folder's own typo.

Usage: `python3 build_phantom_stretch_strips.py`. Requires Pillow.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _sprite_strip_lib import build_hero_pack  # noqa: E402

SRC_ROOT = "/home/jozan/Documents/Characters/Phanton"
OUT_ROOT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "src", "assets", "heroes", "phantom",
)

if __name__ == "__main__":
    build_hero_pack("phantom", SRC_ROOT, OUT_ROOT)
