"""Builds every hero's idle + numbered-emote animation as lossless-pixel
grid sheets, replacing the old single-row/resized/frame-dropped strip
pipeline for profile art (scripts/build_<hero>_stretch_strips.py's
profile/emote half - the MAP marker strips are untouched, still built by
those per-hero scripts, same as always: see that script's own docstring).

Every source PNG plays: no frame dropping, no resizing, no resampling, no
colour reduction - the only transform is a crop (one shared bounding box
per emote, across every one of its own frames, trimming identical
transparent padding without touching native resolution or per-frame
content). A sequence longer than one sheet can hold at native size (GPU
texture limits are commonly 4096-8192px per side on phones) is split
across MULTIPLE sheets packed as a grid (not one long row), capped at
MAX_SHEET_PX per side.

Output layout per hero, alongside the untouched map/ folder:
  src/assets/heroes/<hero>/sheets/<idle|emoteN>/
    manifest.json   {frameCount, frameWidth, frameHeight, sheets:[{file,cols,rows,frames}]}
    sheet0.webp (or .png - whichever is smaller), sheet1.webp, ...
"frameCount" is always literally len(source PNGs) for that sequence -
nothing here hardcodes a frame count; see _verify_* checks below, which
fail the build (SystemExit) if a written manifest or sheet ever disagrees
with the real source/pixel data.

Run before `npm run build` (wired into package.json's `prebuild`):
    python3 scripts/build_emote_sheets.py
Requires Pillow. Needs the raw source drop
(~/Documents/Characters/<Hero>/, ~2.6GB, not checked into this repo - see
_sprite_strip_lib.py's own CATEGORY_ORDER/find_category docstring for why
each hero's drop is keyword-matched rather than hardcoded) - a machine
without that folder can't regenerate sheets, only consume the ones already
committed.
"""

import json
import math
import os
import re
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _sprite_strip_lib import (  # noqa: E402
    CATEGORY_ORDER,
    find_category,
    find_front_view,
    list_subfolders,
    normalize,
)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERO_SRC_ROOTS = {
    "blaze": "/home/jozan/Documents/Characters/Blaze",
    "bolt": "/home/jozan/Documents/Characters/Bolt",
    "comet": "/home/jozan/Documents/Characters/Comet",
    "nova": "/home/jozan/Documents/Characters/Nova",
    "phantom": "/home/jozan/Documents/Characters/Phanton",
    "cyclone": "/home/jozan/Documents/Characters/Cyclone",
    "pulse": "/home/jozan/Documents/Characters/Pulse",
}

MAX_SHEET_PX = 4096  # hard cap per side - see this script's own docstring
PAD = 12
FRAME_NUM_RE = re.compile(r"(\d+)\.png$")


def natural_png_files(folder):
    """Every *.png under `folder`, sorted strictly by the numeric frame
    index embedded in its filename (never as a string) - frame 2 always
    before frame 10 regardless of zero-padding. A file with no parseable
    trailing digit group is skipped (none exist in the current source
    drop - see scripts/audit_source_frames.py - but silently including an
    unrelated file would be worse than dropping it)."""
    numbered = []
    for f in os.listdir(folder):
        if not f.lower().endswith(".png"):
            continue
        m = FRAME_NUM_RE.search(f)
        if m:
            numbered.append((int(m.group(1)), f))
    numbered.sort(key=lambda t: t[0])
    return [os.path.join(folder, f) for _, f in numbered]


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


def save_lossless(im, out_path_no_ext):
    """Lossless WebP if it ends up smaller than lossless PNG for this exact
    image, else PNG (per spec: "lossless WebP, or PNG if WebP is larger or
    buggy") - both are pixel-exact, this only picks the smaller file."""
    webp_path = out_path_no_ext + ".webp"
    png_path = out_path_no_ext + ".png"
    im.save(webp_path, "WEBP", lossless=True, quality=100, method=4)
    im.save(png_path, "PNG", optimize=True)
    webp_size = os.path.getsize(webp_path)
    png_size = os.path.getsize(png_path)
    if webp_size <= png_size:
        os.remove(png_path)
        return os.path.basename(webp_path), webp_size
    os.remove(webp_path)
    return os.path.basename(png_path), png_size


def build_emote_sheets(hero, src_root, out_root, rel_folder, key_dir):
    files = natural_png_files(os.path.join(src_root, rel_folder))
    if not files:
        raise SystemExit(f"{hero}/{key_dir}: no source PNGs under {rel_folder}")
    frame_count = len(files)

    bbox = union_bbox(files)
    canvas_w, canvas_h = Image.open(files[0]).size
    x0, y0, x1, y1 = bbox
    crop_box = (
        max(0, x0 - PAD),
        max(0, y0 - PAD),
        min(canvas_w, x1 + PAD),
        min(canvas_h, y1 + PAD),
    )
    frame_w, frame_h = crop_box[2] - crop_box[0], crop_box[3] - crop_box[1]

    cols = max(1, MAX_SHEET_PX // frame_w)
    rows = max(1, MAX_SHEET_PX // frame_h)
    per_sheet = cols * rows
    n_sheets = math.ceil(frame_count / per_sheet)

    out_dir = os.path.join(out_root, "sheets", key_dir)
    os.makedirs(out_dir, exist_ok=True)
    # Clear stale sheet files from a previous build - a different frame/
    # sheet count this run would otherwise leave orphaned old sheetN files
    # sitting next to the new manifest.
    for f in os.listdir(out_dir):
        if f.startswith("sheet"):
            os.remove(os.path.join(out_dir, f))

    sheets_meta = []
    for s in range(n_sheets):
        start = s * per_sheet
        chunk = files[start : start + per_sheet]
        sheet_cols = min(cols, len(chunk))
        sheet_rows = math.ceil(len(chunk) / sheet_cols)
        sheet = Image.new(
            "RGBA", (sheet_cols * frame_w, sheet_rows * frame_h), (0, 0, 0, 0)
        )
        for i, path in enumerate(chunk):
            im = Image.open(path).convert("RGBA").crop(crop_box)
            if im.size != (frame_w, frame_h):
                raise SystemExit(
                    f"{hero}/{key_dir}: frame {path} cropped to {im.size}, "
                    f"expected {(frame_w, frame_h)} - source frames aren't "
                    "uniformly sized"
                )
            col, row = i % sheet_cols, i // sheet_cols
            sheet.paste(im, (col * frame_w, row * frame_h))
        filename, size_bytes = save_lossless(sheet, os.path.join(out_dir, f"sheet{s}"))
        sheets_meta.append(
            {"file": filename, "cols": sheet_cols, "rows": sheet_rows, "frames": len(chunk)}
        )
        print(
            f"  {hero}/{key_dir} sheet{s}: {sheet.size} frames={len(chunk)} "
            f"bytes={size_bytes}"
        )

    manifest = {
        "frameCount": frame_count,
        "frameWidth": frame_w,
        "frameHeight": frame_h,
        "sheets": sheets_meta,
    }
    with open(os.path.join(out_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")

    # --- Fail the build on any mismatch, not just log it -----------------
    if manifest["frameCount"] != len(files):
        raise SystemExit(
            f"{hero}/{key_dir}: manifest frameCount {manifest['frameCount']} "
            f"!= real source PNG count {len(files)}"
        )
    total_in_sheets = sum(s["frames"] for s in sheets_meta)
    if total_in_sheets != frame_count:
        raise SystemExit(
            f"{hero}/{key_dir}: sheets hold {total_in_sheets} frames total, "
            f"manifest frameCount is {frame_count}"
        )
    for s in sheets_meta:
        sp = os.path.join(out_dir, s["file"])
        im = Image.open(sp)
        expected = (s["cols"] * frame_w, s["rows"] * frame_h)
        if im.size != expected:
            raise SystemExit(
                f"{hero}/{key_dir}/{s['file']}: sheet is {im.size}, expected "
                f"{expected} - output was scaled"
            )
        if max(im.size) > MAX_SHEET_PX:
            raise SystemExit(
                f"{hero}/{key_dir}/{s['file']}: sheet is {im.size}, over the "
                f"{MAX_SHEET_PX}px cap"
            )
    print(f"  ok: {frame_count} frames @ {frame_w}x{frame_h}, {len(sheets_meta)} sheet(s)")
    return manifest


def resolve_hero_categories(src_root):
    """{dir_key: rel_source_folder} for "idle" + every numbered emote this
    hero's drop actually has, in the same found-order (and with the same
    empty-folder skip) build_hero_pack itself uses, so "emoteN" numbering
    matches what the (unrelated, untouched) map pipeline's manifest.json
    still uses for its own emote1-alias bookkeeping."""
    out = {}
    idle_folder = next(
        (e for e in list_subfolders(src_root) if normalize(e) == "idle"), None
    )
    if not idle_folder:
        raise SystemExit(f"no 'idle' folder under {src_root}")
    idle_front = find_front_view(os.path.join(src_root, idle_folder))
    if not idle_front:
        raise SystemExit(f"no front-view angle under {idle_folder}")
    out["idle"] = f"{idle_folder}/{idle_front}"

    next_n = 2
    for key, groups in CATEGORY_ORDER:
        folder = find_category(src_root, *groups)
        if not folder:
            continue
        front = find_front_view(os.path.join(src_root, folder))
        if not front:
            continue
        rel = f"{folder}/{front}"
        full = os.path.join(src_root, rel)
        if not os.path.isdir(full) or not any(
            f.lower().endswith(".png") for f in os.listdir(full)
        ):
            continue
        out[f"emote{next_n}"] = rel
        next_n += 1
    return out


def build_hero(hero, src_root, out_root):
    print(f"=== {hero} ===")
    categories = resolve_hero_categories(src_root)
    for key_dir, rel in categories.items():
        build_emote_sheets(hero, src_root, out_root, rel, key_dir)


if __name__ == "__main__":
    only = sys.argv[1:] or list(HERO_SRC_ROOTS)
    for hero in only:
        src_root = HERO_SRC_ROOTS[hero]
        out_root = os.path.join(REPO_ROOT, "src", "assets", "heroes", hero)
        build_hero(hero, src_root, out_root)
    print("\nAll hero sheet packs built and verified.")
