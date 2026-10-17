"""Builds Blaze's idle-stretch sprite strips, cut from the artist's "Blaze
assets library" drop (not checked into this repo - ~2000 frames, 316MB,
under per-animation folders each with "Straight View" / "Back Top View"
subfolders - only "Straight View", the front-facing render, is used here).

Each SET below pairs two animations (played back to back, looping) into one
"profile" strip (a wide, un-cropped-feet cell for HeroSprite.jsx/
HeroFigure.jsx) and, optionally, a "map" strip re-cropped to the map
marker's native 128x170 cell (contain-fit, bottom-aligned, matching how the
hand-cut run-cycle sheets were built - see TerritoryMap.jsx's
BLAZE_SHEETS). Frames are evenly sampled (24 per animation) and all cropped
to one shared bounding box per set, so Blaze doesn't jump in scale/position
switching poses within that set.

Usage: `python3 build_blaze_stretch_strips.py [set_name ...]` - with no
args, builds every set. Not run automatically; rerun by hand (with
SRC_ROOT pointed at wherever the asset drop lives) if the frame count,
crop padding or cell sizes need retuning. Requires Pillow
(`pip install pillow`).
"""

import glob
import os
import sys

from PIL import Image

SRC_ROOT = "/home/jozan/Downloads/Blaze assets library"
OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "src",
    "assets",
    "images",
)

TARGET_FRAMES = 24  # per animation
PAD = 12
PROFILE_CELL_H = 320  # HeroSprite.jsx / HeroFigure.jsx cell height
MAP_CELL = (128, 170)  # matches blaze-map-run-*.png's native cell

# Each set's "folders" list is the playback order. Straight View is the
# front-facing render - Back Top View (bird's-eye, matches nothing on
# screen today) is never used here.
SETS = {
    # Me tab/profile panel (HeroSprite.jsx) AND the Shop hero card / Hero
    # Detail Modal's idle pose (heroSprites.js) AND the map marker
    # (TerritoryMap.jsx's BLAZE_SHEETS.idle).
    "shoulder_arm": {
        "folders": [
            ("Shoulder stretch", "Straight View"),
            ("Arm Stretching", "Straight   view"),  # irregular spacing on disk
        ],
        "profile_out": "blaze-profile-idle-stretch.png",
        "map_out": "blaze-map-idle-stretch.png",
    },
    # Me tab/profile panel only (HeroSprite.jsx) - see GamePage.jsx's Me
    # dashboard.
    "hello_neck": {
        "folders": [
            ("Hello", "Straight View"),
            ("Neck Stretch", "Straight View"),
        ],
        "profile_out": "blaze-profile-hello-neck-stretch.png",
        "map_out": None,
    },
}


def list_frames(folder):
    return sorted(glob.glob(os.path.join(folder, "*.png")))


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


def build_profile_strip(frame_paths, crop_box, out_name):
    x0, y0, x1, y1 = crop_box
    crop_w, crop_h = x1 - x0, y1 - y0
    scale = PROFILE_CELL_H / crop_h
    cell_w, cell_h = round(crop_w * scale), PROFILE_CELL_H

    strip = Image.new("RGBA", (cell_w * len(frame_paths), cell_h), (0, 0, 0, 0))
    for i, path in enumerate(frame_paths):
        im = Image.open(path).convert("RGBA").crop(crop_box)
        resized = im.resize((cell_w, cell_h), Image.LANCZOS)
        strip.paste(resized, (i * cell_w, 0), resized)

    out_path = os.path.join(OUT_DIR, out_name)
    strip.save(out_path, optimize=True)
    print("saved", out_path, strip.size, "frames=", len(frame_paths))


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
    all_files = {
        folder: list_frames(os.path.join(SRC_ROOT, folder, view))
        for folder, view in spec["folders"]
    }
    for folder, files in all_files.items():
        print(folder, "frame count:", len(files))

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

    first_folder = spec["folders"][0][0]
    canvas_w, canvas_h = Image.open(all_files[first_folder][0]).size
    x0, y0, x1, y1 = global_bbox
    crop_box = (
        max(0, x0 - PAD),
        max(0, y0 - PAD),
        min(canvas_w, x1 + PAD),
        min(canvas_h, y1 + PAD),
    )
    print("global padded bbox:", crop_box)

    frame_paths = []
    for folder, _view in spec["folders"]:
        files = all_files[folder]
        for i in linspace_indices(len(files), TARGET_FRAMES):
            frame_paths.append(files[i])

    os.makedirs(OUT_DIR, exist_ok=True)
    if spec.get("profile_out"):
        build_profile_strip(frame_paths, crop_box, spec["profile_out"])
    if spec.get("map_out"):
        build_map_strip(frame_paths, crop_box, spec["map_out"])


def main():
    names = sys.argv[1:] or list(SETS.keys())
    for name in names:
        build_set(name, SETS[name])


if __name__ == "__main__":
    main()
