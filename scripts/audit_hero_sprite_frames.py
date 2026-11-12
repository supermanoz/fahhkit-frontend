"""Read-only audit of every hero's built sprite pack (no asset writes).

Two checks:
1. Re-runs verify_manifest_matches_strips (see _sprite_strip_lib.py) against
   every committed src/assets/heroes/<hero>/manifest.json - fails (non-zero
   exit) if any declared "frames" value disagrees with the strip it names.
   Doesn't need the raw source drop; works on any machine with this repo
   checked out.
2. Where the raw source drop IS present on this machine
   (~/Documents/Characters/<Hero>/, ~2.6GB, not checked into this repo -
   see each build_<hero>_stretch_strips.py's own SRC_ROOT), re-resolves
   each emote's source category (same find_category/find_front_view logic
   build_hero_pack itself uses, read-only - lists files, builds nothing)
   and reports how many raw PNGs it was sampled down from. A strip with
   fewer frames than its source isn't a bug - build_set deliberately
   downsamples anything past ~60 frames or the WEBP_MAX_STRIP_PX width cap
   (see that module's own docstring) - but it's worth seeing at a glance
   next to the built frame count and the loop duration that count produces
   at SPRITE_FPS, in case a given dance got downsampled far enough to look
   choppy.

Run after rebuilding any hero's pack, or any time to audit the current
committed state:
    python3 scripts/audit_hero_sprite_frames.py
"""

import json
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _sprite_strip_lib import (  # noqa: E402
    CATEGORY_ORDER,
    find_category,
    find_front_view,
    list_frames,
    list_subfolders,
    normalize,
    verify_manifest_matches_strips,
)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Same SRC_ROOT each build_<hero>_stretch_strips.py hardcodes (Phantom's
# folder keeps the source drop's own "Phanton" typo - see that script).
HERO_SRC_ROOTS = {
    "blaze": "/home/jozan/Documents/Characters/Blaze",
    "bolt": "/home/jozan/Documents/Characters/Bolt",
    "comet": "/home/jozan/Documents/Characters/Comet",
    "nova": "/home/jozan/Documents/Characters/Nova",
    "phantom": "/home/jozan/Documents/Characters/Phanton",
    "cyclone": "/home/jozan/Documents/Characters/Cyclone",
    "pulse": "/home/jozan/Documents/Characters/Pulse",
}

# Must match src/utils/spriteTiming.js's SPRITE_FPS - this is a report-only
# constant (for the "loop seconds" column), not the frontend's own source
# of truth, so it's not auto-imported from there.
SPRITE_FPS = 12


def raw_frame_count(src_root, emote_key):
    """Re-resolves which raw source category a given emoteN slot was built
    from (mirrors build_hero_pack's own CATEGORY_ORDER walk, read-only) and
    returns its real PNG count, or None if src_root/the category can't be
    found on this machine."""
    if not os.path.isdir(src_root):
        return None

    if emote_key == "emote1":
        idle_folder = next(
            (e for e in list_subfolders(src_root) if normalize(e) == "idle"), None
        )
        if not idle_folder:
            return None
        front = find_front_view(os.path.join(src_root, idle_folder))
        return len(list_frames(src_root, f"{idle_folder}/{front}")) if front else None

    want_n = int(emote_key.replace("emote", ""))
    next_n = 2
    for _key, groups in CATEGORY_ORDER:
        folder = find_category(src_root, *groups)
        if not folder:
            continue
        front = find_front_view(os.path.join(src_root, folder))
        if not front:
            continue
        count = len(list_frames(src_root, f"{folder}/{front}"))
        # Mirrors build_hero_pack's own skip-on-empty-folder guard exactly
        # (see _sprite_strip_lib.py) - an empty category is never assigned
        # an emoteN slot at all, so it must not consume one here either,
        # or every later category's number comes out one too high (caught
        # via Pulse's genuinely-empty "Thumbs Up/front view" folder, which
        # was silently shifting emote9 onward out of alignment).
        if count == 0:
            continue
        if next_n == want_n:
            return count
        next_n += 1
    return None


def main():
    rows = []
    mismatch_heroes = []

    for hero in sorted(HERO_SRC_ROOTS):
        out_root = os.path.join(REPO_ROOT, "src", "assets", "heroes", hero)
        manifest_path = os.path.join(out_root, "manifest.json")
        if not os.path.exists(manifest_path):
            continue

        try:
            verify_manifest_matches_strips(out_root)
        except SystemExit as e:
            mismatch_heroes.append(str(e))

        with open(manifest_path) as f:
            manifest = json.load(f)

        src_root = HERO_SRC_ROOTS[hero]
        for emote_key, entry in sorted(manifest.get("emotes", {}).items()):
            if "pose" in entry:
                declared = manifest["profile"][entry["pose"]]["frames"]
            else:
                declared = entry["frames"]
            raw = raw_frame_count(src_root, emote_key)
            rows.append((hero, emote_key, raw, declared))

    name_w = max(len(r[0]) for r in rows)
    print(f"{'hero':{name_w}} {'emote':8} {'raw pngs':9} {'strip frames':13} {'fps':4} {'loop (s)':9} {'downsampled'}")
    for hero, emote_key, raw, declared in rows:
        loop_s = round(declared / SPRITE_FPS, 2)
        downsampled = "yes" if (raw is not None and raw > declared) else ""
        raw_s = str(raw) if raw is not None else "? (source drop not found)"
        print(f"{hero:{name_w}} {emote_key:8} {raw_s:9} {declared:13} {SPRITE_FPS:<4} {loop_s:<9} {downsampled}")

    if mismatch_heroes:
        print("\nMANIFEST/STRIP MISMATCHES:")
        for m in mismatch_heroes:
            print(m)
        sys.exit(1)

    print("\nAll manifests match their built strips.")


if __name__ == "__main__":
    main()
