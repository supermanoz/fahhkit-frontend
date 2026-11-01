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
PROFILE_CELL_H = 320  # HeroFigure.jsx / HeroSprite.jsx cell height
# Emote-only art never renders above ~140px on screen (EmoteGlyph's largest
# caller is the buy/showcase popup) - see the original Blaze script's own
# comment for why building it at full profile height was pure waste (a
# decoded ~320px-tall RGBA strip for art always shown shrunk to a sixth of
# that - a root cause of the Me/Emotes-section lag that change fixed).
EMOTE_CELL_H = 190
WEBP_QUALITY = 82  # visually lossless at these sizes, 2-3x smaller than PNG
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


def build_profile_strip(frame_paths, crop_box, out_path, cell_h=PROFILE_CELL_H):
    x0, y0, x1, y1 = crop_box
    crop_w, crop_h = x1 - x0, y1 - y0
    scale = cell_h / crop_h
    cell_w, out_h = round(crop_w * scale), cell_h

    strip = Image.new("RGBA", (cell_w * len(frame_paths), out_h), (0, 0, 0, 0))
    for i, path in enumerate(frame_paths):
        im = Image.open(path).convert("RGBA").crop(crop_box)
        resized = im.resize((cell_w, out_h), Image.LANCZOS)
        strip.paste(resized, (i * cell_w, 0), resized)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    if out_path.endswith(".webp"):
        strip.save(out_path, "WEBP", quality=WEBP_QUALITY, method=6)
    else:
        strip.save(out_path, optimize=True)
    print(
        "saved", out_path, strip.size, "frames=", len(frame_paths),
        "cell=", (cell_w, out_h), "bytes=", os.path.getsize(out_path),
    )
    return {"frames": len(frame_paths), "frameWidth": cell_w, "frameHeight": out_h}


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


WEBP_MAX_STRIP_PX = 16383  # hard format limit; AnimatedSprite.jsx steps one
# single horizontal strip (no grid support), so a strip can never be wider
# than this regardless of how many source frames exist - see build_bolt_
# stretch_strips.py's "idle"/"hip_hop" sets (2026-10-30), which hand-picked
# the largest frame count that still fit for each animation. This computes
# that same cap automatically instead, per set, from the actual crop size.


def build_set(src_root, folders, desired_frames, outputs):
    """folders: rel paths under src_root sampled+concatenated (one shared
    crop box across all of them, so a multi-folder set doesn't jump in
    scale/position switching folders). outputs: list of (out_path, kind,
    cell_h) where kind is "profile" or "map". desired_frames is sampled per
    folder, then capped (see WEBP_MAX_STRIP_PX above) by whichever output
    cell comes out widest - a set with a tall/wide crop or very high source
    frame count gets fewer frames automatically rather than silently
    producing an unloadable strip. Returns {kind: manifest entry dict}
    (file path filled in by the caller)."""
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
    crop_w, crop_h = crop_box[2] - crop_box[0], crop_box[3] - crop_box[1]

    max_frames = desired_frames
    for _out_path, kind, cell_h in outputs:
        cell_w = MAP_CELL[0] if kind == "map" else round(crop_w * (cell_h / crop_h))
        max_frames = min(max_frames, WEBP_MAX_STRIP_PX // cell_w)

    frame_paths = []
    for folder in folders:
        files = all_files[folder]
        for i in linspace_indices(len(files), max_frames):
            frame_paths.append(files[i])

    results = {}
    for out_path, kind, cell_h in outputs:
        if kind == "map":
            results[kind] = build_map_strip(frame_paths, crop_box, out_path)
        else:
            results[kind] = build_profile_strip(frame_paths, crop_box, out_path, cell_h)
    return results


def write_manifest(out_dir, manifest):
    path = os.path.join(out_dir, "manifest.json")
    with open(path, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    print("saved", path)


# --- Numbered-emote pack builder -------------------------------------
#
# Every hero's drop uses different animation-folder names (and plenty of
# typos - "Sqaud"/"Squasd"/"Air squat" all mean squat), so there is no
# shared vocabulary to key emotes by name across all 7 characters. Instead
# every hero's emotes are numbered densely (emote1, emote2, ...), always in
# this same priority order, skipping whatever category that hero's drop
# doesn't have - emote1 is always idle (it's an alias onto the idle pose,
# not a separate file - same zero-extra-bytes mechanism the old "classic"
# emote used). See each build_<hero>_stretch_strips.py call site for the
# one-line rationale on why renumbering an already-named roster (Blaze/
# Bolt/Comet) is still worth it here: a uniform scheme across all 7 beats
# three different naming conventions, at the cost of a backend StoreItem
# rename for whichever of their emotes are already purchased in production
# (tracked separately, not part of this script).
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
EMOTE_FRAMES = 60  # desired; build_set auto-caps per animation to whatever
# actually fits under WEBP_MAX_STRIP_PX for that crop


def build_hero_pack(
    hero,
    src_root,
    out_root,
    idle_frames=IDLE_FRAMES,
    run_frames=RUN_FRAMES,
    emote_frames=EMOTE_FRAMES,
):
    idle_folder = next(
        (e for e in list_subfolders(src_root) if normalize(e) == "idle"), None
    )
    if not idle_folder:
        raise SystemExit(f"{hero}: no top-level 'idle' folder under {src_root}")
    idle_front = find_front_view(os.path.join(src_root, idle_folder))
    if not idle_front:
        raise SystemExit(f"{hero}: no front-view angle under {idle_folder}")

    manifest = {"hero": hero, "map": {}, "profile": {}, "emotes": {}}

    idle_outputs = [
        (os.path.join(out_root, "profile", "idle.webp"), "profile", PROFILE_CELL_H),
        (os.path.join(out_root, "map", "idle.png"), "map", None),
    ]
    idle_results = build_set(
        src_root, [f"{idle_folder}/{idle_front}"], idle_frames, idle_outputs
    )
    manifest["profile"]["idle"] = {
        "file": "profile/idle.webp",
        **idle_results["profile"],
    }
    manifest["map"]["idle"] = {"file": "map/idle.png", **idle_results["map"]}
    manifest["emotes"]["emote1"] = {"pose": "idle"}

    running_folder = find_category(src_root, ("running",))
    run_back = (
        find_plain_back_view(os.path.join(src_root, running_folder))
        if running_folder
        else None
    )
    if run_back:
        run_results = build_set(
            src_root,
            [f"{running_folder}/{run_back}"],
            run_frames,
            [(os.path.join(out_root, "map", "run.png"), "map", None)],
        )
        manifest["map"]["run"] = {"file": "map/run.png", **run_results["map"]}
    else:
        print(f"WARNING: {hero}: no 'Running' top-back angle found - map.run skipped")

    next_n = 2
    for key, groups in CATEGORY_ORDER:
        folder = find_category(src_root, *groups)
        if not folder:
            continue
        front = find_front_view(os.path.join(src_root, folder))
        if not front:
            print(f"WARNING: {hero}: '{folder}' has no front-view angle, skipped")
            continue
        if not list_frames(src_root, f"{folder}/{front}"):
            print(
                f"WARNING: {hero}: '{folder}/{front}' has 0 frames (empty "
                "source folder), skipped"
            )
            continue
        is_dance = key == "dance"
        cell_h = PROFILE_CELL_H if is_dance else EMOTE_CELL_H
        sub = "profile" if is_dance else "emotes"
        emote_key = f"emote{next_n}"
        out_name = f"{emote_key}.webp"
        out_path = os.path.join(out_root, sub, out_name)
        result = build_set(
            src_root, [f"{folder}/{front}"], emote_frames,
            [(out_path, "profile", cell_h)],
        )
        manifest["emotes"][emote_key] = {"file": f"{sub}/{out_name}", **result["profile"]}
        next_n += 1

    os.makedirs(out_root, exist_ok=True)
    write_manifest(out_root, manifest)
    return manifest
