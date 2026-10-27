"""Builds Comet's sprite strips, cut from the artist's "COMET" drop (not
checked into this repo - under per-animation folders each with a "front
view"/"Front view" and "top back view" subfolder, except "Running" which
has one leaf folder per direction instead - only "front view" (or the
matching running direction) is used here, the straight-on render; "top
back view" (bird's-eye, matches nothing on screen today) is never used -
same conventions as build_blaze_stretch_strips.py.

Comet now has every pose Blaze does:
  - idle/hiphop for the per-hero sprite system (src/utils/heroSprites.js's
    `poses`, consumed by HeroFigure.jsx in the Shop hero card, the Hero
    Detail Modal and the Club War hero picker) - idle also doubles as the
    map marker's idle (TerritoryMap.jsx's COMET_SHEETS), same as Blaze's.
  - hello_neck for the Me-tab/profile-panel turntable (HeroSprite.jsx) - a
    wave, then a neck stretch, back to back.
  - run_down/run_left/run_right/run_up for the map marker's directional
    run cycle (TerritoryMap.jsx's COMET_SHEETS), now that Comet is the
    default hero and needs his own animated marker instead of borrowing
    Blaze's.

Two kinds of output per SET, same as Blaze's script:
  - profile_out: a wide, un-cropped-feet cell (HeroFigure.jsx/
    HeroSprite.jsx) - cell width follows the source's own cropped aspect
    ratio at a fixed PROFILE_CELL_H, so if the source art's proportions
    ever change, the frameWidth constants in src/utils/heroSprites.js and
    HeroSprite.jsx's HERO_SHEETS need updating to match (this script
    prints each strip's resulting cell size for that).
  - map_out: re-cropped to the map marker's native 128x170 cell
    (contain-fit, bottom-aligned, matching TerritoryMap.jsx's *_SHEETS
    maps) - always exactly 128x170 regardless of source proportions, so
    nothing downstream needs updating for these.

Usage: `python3 build_comet_stretch_strips.py [set_name ...]` - with no
args, builds every set. Not run automatically; rerun by hand (with
SRC_ROOT pointed at wherever the asset drop lives) if the frame count, crop
padding or cell sizes need retuning. Requires Pillow (`pip install
pillow`).
"""

import glob
import os
import sys

from PIL import Image

SRC_ROOT = "/home/jozan/Documents/Characters/COMET"
OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "src",
    "assets",
    "images",
)

PAD = 12
PROFILE_CELL_H = 320  # HeroFigure.jsx / HeroSprite.jsx cell height
# Emote-only sets never render above 140px on screen (EmoteGlyph's largest
# caller is the buy/showcase popup) - see build_blaze_stretch_strips.py's
# own EMOTE_CELL_H comment for why this matters (decoded-bitmap cost, not
# just the file-size number - this was a root cause of Me/Emotes lag).
EMOTE_CELL_H = 190
WEBP_QUALITY = 82  # profile_out only
MAP_CELL = (128, 170)  # matches blaze-map-run-*.png's native cell

SETS = {
    # Map marker idle (TerritoryMap.jsx COMET_SHEETS.idle, 48 frames) and
    # the Shop hero card / Hero Detail Modal idle pose (heroSprites.js,
    # also 48 frames) - a single stretch animation sampled across its full
    # length instead of two animations spliced together. Comet's pack has
    # a dedicated "idle" folder (unlike Blaze's, which reuses its "Arm
    # stretching" folder for this pose), so that's used directly.
    "idle": {
        "folders": ["idle/front view"],
        "target_frames": 48,
        "profile_out": "comet-profile-idle-stretch.webp",
        "map_out": "comet-map-idle-stretch.png",
    },
    # Shop hero card hover pose (HeroGallery.jsx) - also pickable on the
    # Hero Detail Modal's pose tabs, and (as of this registry update) its
    # own standalone buyable "Hip Hop" emote (utils/emotes.js). 24 frames.
    "hip_hop": {
        "folders": ["Hip Hop/Front view"],
        "target_frames": 24,
        "profile_out": "comet-profile-hiphop.webp",
        "map_out": None,
    },
    # Map marker run cycles (TerritoryMap.jsx COMET_SHEETS) - frame counts
    # match Blaze's own (4 for down/left/right, 15 for up) so the two
    # heroes' run cycles feel the same speed on screen.
    "run_down": {
        "folders": ["Running/Front"],
        "target_frames": 4,
        "profile_out": None,
        "map_out": "comet-map-run-down.png",
    },
    "run_left": {
        "folders": ["Running/side left"],
        "target_frames": 4,
        "profile_out": None,
        "map_out": "comet-map-run-left.png",
    },
    "run_right": {
        "folders": ["Running/side right"],
        "target_frames": 4,
        "profile_out": None,
        "map_out": "comet-map-run-right.png",
    },
    "run_up": {
        # This is now the ONLY run sheet the map marker uses (see
        # TerritoryMap.jsx) - the marker rotates to face travel direction
        # via a CSS transform instead of switching between separate
        # per-direction sheets.
        "folders": ["Running/Top back"],
        "target_frames": 15,
        "profile_out": None,
        "map_out": "comet-map-run-up.png",
    },
    # EmoteShelf art, same "profile-sized" cut as idle/hip_hop. Each needs a
    # real EMOTE StoreItem row (name must match, case-insensitive - see
    # src/utils/emotes.js) before it's purchasable; the admin "Create
    # Emote" tool (src/components/EmoteAdminPanel.jsx) makes those rows.
    # Comet's drop has no "breathing"/"checking shoes" folders (unlike
    # Blaze's), so he gets one fewer emote than Blaze.
    "emote_victory": {
        "folders": ["victory/front view"],
        "target_frames": 24,
        "profile_out": "comet-emote-victory.webp",
        "profile_cell_h": EMOTE_CELL_H,
        "map_out": None,
    },
    "emote_jumping_jack": {
        "folders": ["jumping jack/front view"],
        "target_frames": 24,
        "profile_out": "comet-emote-jumping-jack.webp",
        "profile_cell_h": EMOTE_CELL_H,
        "map_out": None,
    },
    "emote_shoulder_rub": {
        "folders": ["shoulder rubbing/front view"],
        "target_frames": 24,
        "profile_out": "comet-emote-shoulder-rub.webp",
        "profile_cell_h": EMOTE_CELL_H,
        "map_out": None,
    },
    "emote_squat": {
        "folders": ["Squasd/Front view"],
        "target_frames": 24,
        "profile_out": "comet-emote-squat.webp",
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
    # Blaze's run-cycle sheets are built (see build_blaze_stretch_strips.py).
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
