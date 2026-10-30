"""Builds Bolt's sprite strips, cut from the artist's drop at
/home/jozan/Documents/Characters/Bolt_1/Bolt (not checked into this repo -
393MB, 3095 PNG frames at a uniform 332x500, under per-animation folders
each with a straight-on and a bird's-eye subfolder, except "Running" which
has 9 directional leaf folders instead). Same two-output convention as
build_blaze_stretch_strips.py / build_comet_stretch_strips.py - read that
file's own comment for the full rationale (profile_out vs map_out, why
EMOTE_CELL_H exists, WEBP_QUALITY, contain-fit map cropping).

Deviates from Blaze/Comet in two ways, both deliberate (see the chat that
specified this script, 2026-10-30):
  - Only ONE run sheet is built (map marker top-back/rotating view, 15
    frames) - TerritoryMap.jsx's HERO_MAP_SHEETS only ever uses one sheet
    per pose now (the marker rotates via CSS), so the legacy run_down/
    run_left/run_right sets Blaze/Comet's scripts still build are pure
    waste for a brand new hero and are skipped here.
  - heroSprites.js's `run`/`charge` poses (consumed by HeroFigure's `pose`
    prop) are skipped too - HeroDetailModal.jsx's MODAL_POSES only ever
    offers 'idle'/'hiphop', so those poses are unreachable dead weight for
    every hero that has them, not just a Bolt-specific gap.
  - idle/hiphop/every emote PROFILE strip use ALL available source frames
    (not trimmed to Blaze/Comet's 48/24-frame budget) - an explicit choice
    accepting a larger decode/file-size cost for smoother motion. The MAP
    marker's idle/run sheets are NOT included in that choice - those stay
    at Blaze/Comet's existing 48/15 frame counts, since that's a different,
    always-visible-during-play consumer with its own already-tuned CSS
    timing, not the Me-tab/Emote-shelf lag this trade-off was about.

Usage: `python3 build_bolt_stretch_strips.py [set_name ...]` - with no
args, builds every set. Requires Pillow (`pip install pillow`).
"""

import glob
import os
import sys

from PIL import Image

SRC_ROOT = "/home/jozan/Documents/Characters/Bolt_1/Bolt"
OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "src",
    "assets",
    "images",
)

PAD = 12
PROFILE_CELL_H = 320  # HeroFigure.jsx / HeroSprite.jsx cell height
EMOTE_CELL_H = 190  # see build_blaze_stretch_strips.py's own comment
WEBP_QUALITY = 82  # profile_out only
MAP_CELL = (128, 170)  # matches blaze/comet-map-run-*.png's native cell

SETS = {
    "idle": {
        # 239 source frames would need a 38,479px strip - WebP's hard limit
        # is 16,383px/side, and AnimatedSprite.jsx steps through one single
        # horizontal strip (no grid support), so 101 is the largest count
        # that still fits (16,261px) - see the chat that specified this,
        # 2026-10-30.
        "folders": ["Idle/Front View"],
        "target_frames": 101,
        "profile_out": "bolt-profile-idle-stretch.webp",
        "profile_cell_h": PROFILE_CELL_H,
        "map_out": None,
    },
    "idle_map": {
        "folders": ["Idle/Top Back View"],
        "target_frames": 48,  # matches Blaze/Comet's map marker idle cadence
        "profile_out": None,
        "map_out": "bolt-map-idle-stretch.png",
    },
    "hip_hop": {
        # 405 source frames would need a 108,135px strip - same WebP/strip
        # limit as idle above; 61 is the largest count that fits (16,287px).
        "folders": ["Hip Hop  Dance/Front View"],
        "target_frames": 61,
        "profile_out": "bolt-profile-hiphop.webp",
        "profile_cell_h": PROFILE_CELL_H,
        "map_out": None,
    },
    "run_up": {
        "folders": ["Running/Top Back View"],
        "target_frames": 15,  # matches Blaze/Comet's map marker run cadence
        "profile_out": None,
        "map_out": "bolt-map-run-up.png",
    },
    "emote_victory": {
        "folders": ["victory/front view"],
        "target_frames": 109,
        "profile_out": "bolt-emote-victory.webp",
        "profile_cell_h": EMOTE_CELL_H,
        "map_out": None,
    },
    "emote_checking_shoes": {
        "folders": ["checking Shoes/front"],
        "target_frames": 114,
        "profile_out": "bolt-emote-checking-shoes.webp",
        "profile_cell_h": EMOTE_CELL_H,
        "map_out": None,
    },
    "emote_jumping_jack": {
        "folders": ["jumping jack/front view"],
        "target_frames": 27,
        "profile_out": "bolt-emote-jumping-jack.webp",
        "profile_cell_h": EMOTE_CELL_H,
        "map_out": None,
    },
    "emote_shoulder_rub": {
        "folders": ["shoulder rubbing/front view"],
        "target_frames": 141,
        "profile_out": "bolt-emote-shoulder-rub.webp",
        "profile_cell_h": EMOTE_CELL_H,
        "map_out": None,
    },
    "emote_squat": {
        "folders": ["Sqaud/Front View"],
        "target_frames": 45,
        "profile_out": "bolt-emote-squat.webp",
        "profile_cell_h": EMOTE_CELL_H,
        "map_out": None,
    },
    # New emotes (no existing slot in utils/emotes.js before this task).
    "emote_thumbs_up": {
        "folders": ["Thumps up_/front view"],
        "target_frames": 101,
        "profile_out": "bolt-emote-thumbs-up.webp",
        "profile_cell_h": EMOTE_CELL_H,
        "map_out": None,
    },
    "emote_waving_hand": {
        "folders": ["Waving Hand/Front View"],
        "target_frames": 36,
        "profile_out": "bolt-emote-waving-hand.webp",
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
    if out_name.endswith(".webp"):
        strip.save(out_path, "WEBP", quality=WEBP_QUALITY, method=6)
    else:
        strip.save(out_path, optimize=True)
    print(
        "saved", out_path, strip.size,
        "frames=", len(frame_paths),
        "cell=", (cell_w, out_h),
        "bytes=", os.path.getsize(out_path),
    )


def build_map_strip(frame_paths, crop_box, out_name):
    x0, y0, x1, y1 = crop_box
    crop_w, crop_h = x1 - x0, y1 - y0
    cell_w, cell_h = MAP_CELL
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
            frame_paths, crop_box, spec["profile_out"],
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
