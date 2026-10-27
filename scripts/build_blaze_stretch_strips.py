"""Builds Blaze's sprite strips, cut from the artist's "Blaze animation png
sequence" drop (not checked into this repo - 319MB, under per-animation
folders each with a "front view" and "top back view" subfolder, except
"Blaze running png sequence" which has one leaf folder per direction
instead - only "front view" (or the matching running direction) is used
here, the straight-on render; "top back view" (bird's-eye, matches nothing
on screen today) is never used.

Two kinds of output per SET:
  - profile_out: a wide, un-cropped-feet cell (HeroSprite.jsx/
    HeroFigure.jsx) - cell width follows the source's own cropped aspect
    ratio at a fixed PROFILE_CELL_H, so if the source art's proportions
    ever change, the frameWidth constants in src/utils/heroSprites.js and
    CELL_ASPECT in src/components/HeroSprite.jsx need updating to match
    (this script prints each strip's resulting cell size for that).
  - map_out: re-cropped to the map marker's native 128x170 cell
    (contain-fit, bottom-aligned, matching TerritoryMap.jsx's
    HERO_MAP_SHEETS) - always exactly 128x170 regardless of source
    proportions, so nothing downstream needs updating for these.

A set's folders are sampled TARGET_FRAMES each (evenly) and concatenated in
list order, so a multi-folder set (e.g. waving -> neck stretch) plays back
to back, looping. All frames in a set share one crop box (the union of
every sampled frame's bbox, padded) so Blaze doesn't jump in scale/position
switching folders within it. Frame counts are chosen to match exactly what
the frontend currently declares (HERO_MAP_SHEETS / heroSprites.js poses) so
no frontend code changes are needed for a straight asset refresh.

Usage: `python3 build_blaze_stretch_strips.py [set_name ...]` - with no
args, builds every set. Not run automatically; rerun by hand (with
SRC_ROOT pointed at wherever the asset drop lives) if the frame count, crop
padding or cell sizes need retuning. Requires Pillow (`pip install
pillow`).
"""

import glob
import os
import sys

from PIL import Image

SRC_ROOT = (
    "/home/jozan/Documents/Characters/BLAZE/Blaze animation png sequence"
)
OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "src",
    "assets",
    "images",
)

PAD = 12
PROFILE_CELL_H = 320  # HeroSprite.jsx / HeroFigure.jsx cell height
# Emote-only sets never render above 140px on screen (EmoteGlyph's largest
# caller is the buy/showcase popup) - building them at the full profile
# height was pure waste (a decoded ~320px-tall x thousands-of-px-wide RGBA
# strip for art that's always shown shrunk to a sixth of that), one of the
# root causes of the Me/Emotes-section lag this was built to fix. ~1.4x the
# largest on-screen size covers a retina display without the 320px strips'
# bloat.
EMOTE_CELL_H = 190
WEBP_QUALITY = 82  # profile_out only - visually lossless at this size, 2-3x smaller than PNG for this gradient/alpha-heavy art
MAP_CELL = (128, 170)  # matches blaze-map-run-*.png's native cell

SETS = {
    # Map marker idle (TerritoryMap.jsx BLAZE_SHEETS.idle, 48 frames), the
    # Shop hero card / Hero Detail Modal idle pose (heroSprites.js, also 48
    # frames), AND (per the "idle = default emote" request) the "Classic"
    # emote's art (utils/emotes.js's EMOTE_NAME_TO_POSE) - one calm loop
    # covering all three now. The drop's own "breathing" folder was renamed
    # to "idle" for this (same 235 frames, same "front vew" typo) - this
    # used to point at "Arm stretching" instead, which is now unused.
    "idle": {
        "folders": ["idle/front vew"],
        "target_frames": 48,
        "profile_out": "blaze-profile-idle-stretch.webp",
        "map_out": "blaze-map-idle-stretch.png",
    },
    # Shop hero card hover pose (heroSprites.js's "hiphop" pose, 24 frames)
    # - also selectable as a pose tab on the Hero Detail Modal, and (as of
    # this registry update) its own standalone buyable "Hip Hop" emote
    # (utils/emotes.js). No "Hip Hop" folder in this drop, so break dance
    # stands in - same energetic dance-move spirit.
    "hip_hop": {
        "folders": ["break dance/ front view"],
        "target_frames": 24,
        "profile_out": "blaze-profile-hiphop.webp",
        "map_out": None,
    },
    # Map marker run cycles (TerritoryMap.jsx BLAZE_SHEETS) - this drop's
    # "Blaze running png sequence" finally gives these a real run cycle
    # instead of the old hand-cut 4-frame (15 for "up") sheets; frame
    # counts are kept the same as before anyway so no frontend changes are
    # needed for a pure asset refresh.
    "run_down": {
        "folders": ["Blaze running png sequence/running front view"],
        "target_frames": 4,
        "profile_out": None,
        "map_out": "blaze-map-run-down.png",
    },
    "run_left": {
        "folders": ["Blaze running png sequence/running side left"],
        "target_frames": 4,
        "profile_out": None,
        "map_out": "blaze-map-run-left.png",
    },
    "run_right": {
        "folders": ["Blaze running png sequence/running side right"],
        "target_frames": 4,
        "profile_out": None,
        "map_out": "blaze-map-run-right.png",
    },
    "run_up": {
        # "top back" is this drop's "facing away from camera" angle for
        # every animation (paired with "front view" throughout), so it
        # doubles as the back-view run here too. This is now the ONLY run
        # sheet the map marker uses (see TerritoryMap.jsx) - the marker
        # rotates to face travel direction via a CSS transform instead of
        # switching between separate per-direction sheets.
        "folders": ["Blaze running png sequence/running top back"],
        "target_frames": 15,
        "profile_out": None,
        "map_out": "blaze-map-run-up.png",
    },
    # EmoteShelf art - EMOTE_CELL_H/webp, not the full profile_out cut (see
    # EMOTE_CELL_H's own comment). Each needs a real EMOTE StoreItem row
    # (name must match, case-insensitive - see src/utils/emotes.js) before
    # it's purchasable; the admin "Create Emote" tool
    # (src/components/EmoteAdminPanel.jsx) makes those rows.
    "emote_victory": {
        "folders": ["victory/front view"],
        "target_frames": 24,
        "profile_out": "blaze-emote-victory.webp",
        "profile_cell_h": EMOTE_CELL_H,
        "map_out": None,
    },
    # Note: the old "breathing" folder this used to pull from was renamed
    # to "idle" (see the idle set above) - it's now Classic's art, not a
    # separate buyable emote, so there's no emote_breathing set any more.
    "emote_checking_shoes": {
        "folders": ["checking shoes/ front view"],
        "target_frames": 24,
        "profile_out": "blaze-emote-checking-shoes.webp",
        "profile_cell_h": EMOTE_CELL_H,
        "map_out": None,
    },
    "emote_jumping_jack": {
        "folders": ["jumping jack/front view"],
        "target_frames": 24,
        "profile_out": "blaze-emote-jumping-jack.webp",
        "profile_cell_h": EMOTE_CELL_H,
        "map_out": None,
    },
    "emote_shoulder_rub": {
        "folders": ["shoulder rubbing/front view"],
        "target_frames": 24,
        "profile_out": "blaze-emote-shoulder-rub.webp",
        "profile_cell_h": EMOTE_CELL_H,
        "map_out": None,
    },
    "emote_squat": {
        "folders": [" squat/font view"],
        "target_frames": 24,
        "profile_out": "blaze-emote-squat.webp",
        "profile_cell_h": EMOTE_CELL_H,
        "map_out": None,
    },
}


def list_frames(rel_folder):
    return sorted(glob.glob(os.path.join(SRC_ROOT, rel_folder, "*.png")))


def union_bbox(files):
    bbox = None
    for f in files:
        b = Image.open(f).getbbox()
        if b is None:
            continue
        if bbox is None:
            bbox = list(b)
        else:
            bbox[0] = min(bbox[0], b[0])
            bbox[1] = min(bbox[1], b[1])
            bbox[2] = max(bbox[2], b[2])
            bbox[3] = max(bbox[3], b[3])
    return tuple(bbox)


def linspace_indices(n, count):
    if count >= n:
        return list(range(n))
    return [round(i * (n - 1) / (count - 1)) for i in range(count)]


def build_profile_strip(frame_paths, crop_box, out_name, cell_h=PROFILE_CELL_H):
    x0, y0, x1, y1 = crop_box
    crop_w, crop_h = x1 - x0, y1 - y0
    scale = cell_h / crop_h
    cell_w, out_h = round(crop_w * scale), cell_h

    strip = Image.new("RGBA", (cell_w * len(frame_paths), out_h), (0, 0, 0, 0))
    for i, path in enumerate(frame_paths):
        im = Image.open(path).convert("RGBA").crop(crop_box)
        resized = im.resize((cell_w, out_h), Image.LANCZOS)
        strip.paste(resized, (i * cell_w, 0), resized)

    out_path = os.path.join(OUT_DIR, out_name)
    # WebP (lossy, alpha-capable) instead of lossless PNG - 2-3x smaller for
    # this gradient/photographic-shaded art with no visible quality loss at
    # the size these ever render on screen. See EMOTE_CELL_H's comment for
    # why this mattered enough to fix (decoded-bitmap cost, not just the
    # file-size number).
    if out_name.endswith(".webp"):
        strip.save(out_path, "WEBP", quality=WEBP_QUALITY, method=6)
    else:
        strip.save(out_path, optimize=True)
    print(
        "saved",
        out_path,
        strip.size,
        "frames=",
        len(frame_paths),
        "cell=",
        (cell_w, out_h),
        "bytes=",
        os.path.getsize(out_path),
    )


def build_map_strip(frame_paths, crop_box, out_name):
    x0, y0, x1, y1 = crop_box
    crop_w, crop_h = x1 - x0, y1 - y0
    cell_w, cell_h = MAP_CELL
    # Contain-fit (scale by height, center horizontally, bottom-align
    # vertically) instead of stretching to the cell's aspect - matches how
    # the hand-cut run-cycle sheets were built ("frames bottom-aligned into
    # uniform cells", see SESSION_NOTES "Blaze animated map sprite").
    scale = cell_h / crop_h
    fit_w, fit_h = round(crop_w * scale), cell_h
    x_off = (cell_w - fit_w) // 2

    strip = Image.new("RGBA", (cell_w * len(frame_paths), cell_h), (0, 0, 0, 0))
    for i, path in enumerate(frame_paths):
        im = Image.open(path).convert("RGBA").crop(crop_box)
        resized = im.resize((fit_w, fit_h), Image.LANCZOS)
        strip.paste(resized, (i * cell_w + x_off, 0), resized)

    out_path = os.path.join(OUT_DIR, out_name)
    strip.save(out_path, optimize=True)
    print("saved", out_path, strip.size, "frames=", len(frame_paths))


def build_set(name, spec):
    print("--- set:", name, "---")
    all_files = {folder: list_frames(folder) for folder in spec["folders"]}
    for folder, files in all_files.items():
        print(folder, "frame count:", len(files))
        if not files:
            raise SystemExit(f"no frames found under {SRC_ROOT}/{folder}")

    global_bbox = None
    for files in all_files.values():
        b = union_bbox(files)
        if global_bbox is None:
            global_bbox = list(b)
        else:
            global_bbox[0] = min(global_bbox[0], b[0])
            global_bbox[1] = min(global_bbox[1], b[1])
            global_bbox[2] = max(global_bbox[2], b[2])
            global_bbox[3] = max(global_bbox[3], b[3])

    first_folder = spec["folders"][0]
    canvas_w, canvas_h = Image.open(all_files[first_folder][0]).size
    x0, y0, x1, y1 = global_bbox
    crop_box = (
        max(0, x0 - PAD),
        max(0, y0 - PAD),
        min(canvas_w, x1 + PAD),
        min(canvas_h, y1 + PAD),
    )
    print("global padded bbox:", crop_box)

    target_frames = spec["target_frames"]
    frame_paths = []
    for folder in spec["folders"]:
        files = all_files[folder]
        for i in linspace_indices(len(files), target_frames):
            frame_paths.append(files[i])

    os.makedirs(OUT_DIR, exist_ok=True)
    if spec.get("profile_out"):
        build_profile_strip(
            frame_paths,
            crop_box,
            spec["profile_out"],
            spec.get("profile_cell_h", PROFILE_CELL_H),
        )
    if spec.get("map_out"):
        build_map_strip(frame_paths, crop_box, spec["map_out"])


def main():
    names = sys.argv[1:] or list(SETS.keys())
    for name in names:
        build_set(name, SETS[name])


if __name__ == "__main__":
    main()
