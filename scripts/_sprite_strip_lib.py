"""Shared mechanics for scripts/build_<hero>_stretch_strips.py.

Factored out once a 4th/5th/6th/7th hero needed the exact same crop/sample/
strip-build logic Blaze's original script introduced (union-bbox crop,
evenly-sampled frame count, stretch-fit profile cell vs contain-fit map
cell) - seven near-identical ~200-line copies of that would just be seven
places to fix the same bug. Each per-hero script still owns its own
SRC_ROOT and still writes its own manifest.json; only the mechanics and the
category-folder lookup moved here.

Category lookup is keyword-based, not a hardcoded exact path, because the
artist's own folder names are wildly inconsistent animation to animation
and hero to hero ("front view" / "front vew" / "font view" / "front viewe"
/ " front view"; "Sqaud" / "Squasd" / "Air squat"; "top back view" / "top
bacviewk" / "top  bgack view" / "top backview3") - hardcoding exact strings
the way build_blaze_stretch_strips.py originally did is exactly how a typo
like that silently builds the wrong animation (or crashes) six hero-scripts
from now. find_front_view/find_back_view instead key off whether "top"/
"back" appears in the normalized name at all, which happens to be typo-
proof across every variant actually present in the drop.
"""

import glob
import json
import os
import re

from PIL import Image

PAD = 12
MAP_CELL = (128, 170)  # matches the map marker's native cell


def normalize(name):
    return re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()


def list_subfolders(root):
    if not os.path.isdir(root):
        return []
    return sorted(e for e in os.listdir(root) if os.path.isdir(os.path.join(root, e)))


def find_category(root, *keyword_groups):
    """First top-level subfolder of `root` whose normalized name contains
    every keyword in one of the given groups (each group is a tuple of
    keywords, groups tried in order) - e.g. find_category(root, ("hip",
    "hop"), ("dance",)) matches "Hip Hop  Dance", "Hip Hop" or "dancing"."""
    for entry in list_subfolders(root):
        norm = normalize(entry)
        for group in keyword_groups:
            if all(kw in norm for kw in group):
                return entry
    return None


def find_front_view(category_root):
    """The straight-on render sub-folder ("front view"/"front vew"/"font
    view"/"Front"/...) - anything NOT the bird's-eye "top back" angle."""
    for entry in list_subfolders(category_root):
        norm = normalize(entry)
        if "top" not in norm and "back" not in norm:
            return entry
    return None


def find_plain_back_view(category_root):
    """The Running category's plain "top back" angle specifically (not a
    45-degree/side variant) - the map marker's one back-facing run cycle
    (see each build_<hero>_stretch_strips.py's own "run" set comment)."""
    for entry in list_subfolders(category_root):
        norm = normalize(entry)
        if "top" in norm and "back" in norm and "45" not in norm:
            return entry
    return None


def list_frames(root, rel_folder):
    return sorted(glob.glob(os.path.join(root, rel_folder, "*.png")))


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


def build_map_strip(frame_paths, crop_box, out_path):
    x0, y0, x1, y1 = crop_box
    crop_w, crop_h = x1 - x0, y1 - y0
    cell_w, cell_h = MAP_CELL
    # Contain-fit (scale by height, center horizontally, bottom-align
    # vertically), not stretched to the cell's aspect - matches the hand-
    # cut sheets this originally replaced.
    scale = cell_h / crop_h
    fit_w, fit_h = round(crop_w * scale), cell_h
    x_off = (cell_w - fit_w) // 2

    strip = Image.new("RGBA", (cell_w * len(frame_paths), cell_h), (0, 0, 0, 0))
    for i, path in enumerate(frame_paths):
        im = Image.open(path).convert("RGBA").crop(crop_box)
        resized = im.resize((fit_w, fit_h), Image.LANCZOS)
        strip.paste(resized, (i * cell_w + x_off, 0), resized)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    strip.save(out_path, optimize=True)
    print("saved", out_path, strip.size, "frames=", len(frame_paths))
    return {"frames": len(frame_paths), "frameWidth": cell_w, "frameHeight": cell_h}


WEBP_MAX_STRIP_PX = 16383  # hard format limit; the map marker still steps
# one single horizontal strip (no grid support - unlike sheets/, which is
# what scripts/build_emote_sheets.py uses for everything that DOES need
# one), so a strip can never be wider than this regardless of how many
# source frames exist. This computes that cap automatically, from the
# actual crop size.


def build_set(src_root, folders, desired_frames, out_path):
    """folders: rel paths under src_root sampled+concatenated (one shared
    crop box across all of them, so a multi-folder set doesn't jump in
    scale/position switching folders). desired_frames is sampled down to
    whatever fits under WEBP_MAX_STRIP_PX for the map marker's fixed cell
    width - a very high source frame count gets fewer frames automatically
    rather than silently producing an unloadable strip (map/ only - this
    downsampling is deliberate and unchanged by the 2026-11 emote rebuild,
    which only touches profile idle + emotes, built separately by
    scripts/build_emote_sheets.py with no downsampling at all). Returns the
    map manifest entry dict (file path filled in by the caller)."""
    all_files = {folder: list_frames(src_root, folder) for folder in folders}
    for folder, files in all_files.items():
        if not files:
            raise SystemExit(f"no frames found under {src_root}/{folder}")

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

    first_folder = folders[0]
    canvas_w, canvas_h = Image.open(all_files[first_folder][0]).size
    x0, y0, x1, y1 = global_bbox
    crop_box = (
        max(0, x0 - PAD),
        max(0, y0 - PAD),
        min(canvas_w, x1 + PAD),
        min(canvas_h, y1 + PAD),
    )

    max_frames = min(desired_frames, WEBP_MAX_STRIP_PX // MAP_CELL[0])

    frame_paths = []
    for folder in folders:
        files = all_files[folder]
        for i in linspace_indices(len(files), max_frames):
            frame_paths.append(files[i])

    return build_map_strip(frame_paths, crop_box, out_path)


def write_manifest(out_dir, manifest):
    path = os.path.join(out_dir, "manifest.json")
    with open(path, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    print("saved", path)


def verify_manifest_matches_strips(out_dir):
    """Re-opens every strip this manifest.json names and recomputes its real
    frame count from pixel width (strip width / frameWidth), asserting it
    exactly matches the "frames" value just written - fails the build
    (SystemExit) on any mismatch instead of letting a wrong number reach
    the frontend silently.

    Every strip here is built as Image.new(..., (cell_w * len(frame_paths),
    ...)) (see build_profile_strip/build_map_strip) and "frames" is always
    written as that same len(frame_paths), so within a single run these
    can never actually disagree - what this guards against is manifest.json
    drifting from the real asset afterward (a hand-edit, a stale manifest
    left behind after an asset file was swapped some other way, or a
    manifest committed from a different pipeline run than the strip next
    to it). Also runnable standalone, read-only, via
    scripts/audit_hero_sprite_frames.py - this function doesn't need the
    raw source drop, only what's already in out_dir.
    """
    manifest_path = os.path.join(out_dir, "manifest.json")
    with open(manifest_path) as f:
        manifest = json.load(f)

    problems = []

    def check(label, entry):
        path = os.path.join(out_dir, entry["file"])
        if not os.path.exists(path):
            problems.append(f"{label}: {entry['file']} missing on disk")
            return
        real = Image.open(path).width / entry["frameWidth"]
        if abs(real - entry["frames"]) > 0.01:
            problems.append(
                f"{label}: manifest says {entry['frames']} frames, "
                f"strip ({entry['file']}) is actually {real:.2f}"
            )

    for group in ("profile", "map"):
        for key, entry in manifest.get(group, {}).items():
            check(f"{group}.{key}", entry)
    for key, entry in manifest.get("emotes", {}).items():
        if "pose" in entry:
            continue  # idle alias - already checked as profile.idle above
        check(f"emotes.{key}", entry)

    if problems:
        raise SystemExit(
            f"{manifest.get('hero', '?')}: manifest/strip frame-count "
            "mismatch:\n" + "\n".join(f"  - {p}" for p in problems)
        )


# Every hero's drop uses different animation-folder names (and plenty of
# typos - "Sqaud"/"Squasd"/"Air squat" all mean squat), so there is no
# shared vocabulary to key emotes by name across all 7 characters - instead
# every hero's idle + numbered emotes are resolved by keyword category, in
# this same priority order, skipping whatever category that hero's drop
# doesn't have. Shared by scripts/build_emote_sheets.py (the current
# profile/emote pipeline - lossless grid sheets, every source frame, no
# resize) and this file's own build_hero_pack (map marker only - see its
# own docstring for why that one stayed on the old single-row-strip
# approach instead).
CATEGORY_ORDER = [
    ("dance", (("hip", "hop"), ("danc",))),
    ("victory", (("victory",),)),
    ("checking_shoes", (("checking",),)),
    ("jumping_jack", (("jumping", "jack"),)),
    ("shoulder_rub", (("shoulder", "rub"),)),
    ("shoulder_stretch", (("shoulder", "stretch"),)),
    ("squat", (("sq",),)),
    ("waving", (("wav",),)),
    ("thumbs_up", (("thump",), ("thumb",))),
    ("neck_stretch", (("neck",),)),
    ("arm_stretch", (("arm", "stretch"), ("full", "stretch"))),
]

IDLE_FRAMES = 48  # matches the map marker's existing idle cadence
RUN_FRAMES = 15  # matches the map marker's existing run cadence


def build_hero_pack(hero, src_root, out_root, idle_frames=IDLE_FRAMES, run_frames=RUN_FRAMES):
    """Builds ONLY this hero's map/ marker strips (idle + run - the
    continuously-moving overlay on the live territory map, a different
    rendering problem than a framed idle/emote display and not part of the
    2026-11 emote rebuild - see heroManifest.js's own comment on why it
    stayed on this older, resized/downsampled-on-purpose pipeline).
    Profile idle + every numbered emote are built separately, by
    scripts/build_emote_sheets.py, as lossless multi-sheet packs under
    sheets/ - this function no longer touches that output at all (it used
    to, before the 2026-11 rebuild - see git history for the old
    profile/emote strip code this replaced)."""
    idle_folder = next(
        (e for e in list_subfolders(src_root) if normalize(e) == "idle"), None
    )
    if not idle_folder:
        raise SystemExit(f"{hero}: no top-level 'idle' folder under {src_root}")
    idle_front = find_front_view(os.path.join(src_root, idle_folder))
    if not idle_front:
        raise SystemExit(f"{hero}: no front-view angle under {idle_folder}")

    manifest = {"hero": hero, "map": {}}

    idle_result = build_set(
        src_root,
        [f"{idle_folder}/{idle_front}"],
        idle_frames,
        os.path.join(out_root, "map", "idle.png"),
    )
    manifest["map"]["idle"] = {"file": "map/idle.png", **idle_result}

    running_folder = find_category(src_root, ("running",))
    run_back = (
        find_plain_back_view(os.path.join(src_root, running_folder))
        if running_folder
        else None
    )
    if run_back:
        run_result = build_set(
            src_root,
            [f"{running_folder}/{run_back}"],
            run_frames,
            os.path.join(out_root, "map", "run.png"),
        )
        manifest["map"]["run"] = {"file": "map/run.png", **run_result}
    else:
        print(f"WARNING: {hero}: no 'Running' top-back angle found - map.run skipped")

    os.makedirs(out_root, exist_ok=True)
    write_manifest(out_root, manifest)
    verify_manifest_matches_strips(out_root)
    return manifest
