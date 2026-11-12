"""Read-only, full-detail audit of every hero's RAW source PNG sequence
(idle + every numbered emote) against the currently-built (old, single-row,
downsampled/resized) strip in src/assets/heroes/<hero>/.

Only runs anything meaningful on a machine with the raw source drop present
(~/Documents/Characters/<Hero>/, ~2.6GB, not checked into this repo - see
each build_<hero>_stretch_strips.py's own SRC_ROOT). Confirms the root
cause for the emote-rebuild task: every old strip is both downsampled
(fewer frames than source) AND resized (strip cell size != native source
frame size, since build_profile_strip always scales to a fixed cell
height).

Run: python3 scripts/audit_source_frames.py
"""

import json
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

FRAME_NUM_RE = re.compile(r"(\d+)\.png$")


def natural_frame_files(folder):
    """(sorted_file_list, frame_numbers, gaps, duplicates) - sorted strictly
    by the numeric frame index embedded in each filename (never as a
    string), so frame 2 always sorts before frame 10 regardless of
    zero-padding."""
    files = [f for f in os.listdir(folder) if f.lower().endswith(".png")]
    numbered = []
    unnumbered = []
    for f in files:
        m = FRAME_NUM_RE.search(f)
        if m:
            numbered.append((int(m.group(1)), f))
        else:
            unnumbered.append(f)
    numbered.sort(key=lambda t: t[0])
    nums = [n for n, _ in numbered]
    dupes = sorted({n for n in nums if nums.count(n) > 1})
    gaps = []
    if nums:
        full = set(range(min(nums), max(nums) + 1))
        gaps = sorted(full - set(nums))
    sorted_files = [os.path.join(folder, f) for _, f in numbered]
    return sorted_files, nums, gaps, dupes, unnumbered


def frame_sizes(file_paths):
    sizes = set()
    for p in file_paths:
        sizes.add(Image.open(p).size)
    return sizes


def resolve_hero_categories(src_root):
    """{emote_key: (folder, front_view_subfolder)} for idle + every numbered
    emote this hero's drop actually has - same resolution order
    build_hero_pack itself uses (including its empty-folder skip), so slot
    numbers match what's really built."""
    out = {}
    idle_folder = next(
        (e for e in list_subfolders(src_root) if normalize(e) == "idle"), None
    )
    if idle_folder:
        front = find_front_view(os.path.join(src_root, idle_folder))
        if front:
            out["emote1"] = (f"{idle_folder}/{front}", "idle (alias)")

    next_n = 2
    for key, groups in CATEGORY_ORDER:
        folder = find_category(src_root, *groups)
        if not folder:
            continue
        front = find_front_view(os.path.join(src_root, folder))
        if not front:
            continue
        rel = f"{folder}/{front}"
        if not os.path.isdir(os.path.join(src_root, rel)):
            continue
        has_any = any(
            f.lower().endswith(".png")
            for f in os.listdir(os.path.join(src_root, rel))
        )
        if not has_any:
            continue
        out[f"emote{next_n}"] = (rel, key)
        next_n += 1
    return out


def main():
    rows = []
    issues = []

    for hero in sorted(HERO_SRC_ROOTS):
        src_root = HERO_SRC_ROOTS[hero]
        out_root = os.path.join(REPO_ROOT, "src", "assets", "heroes", hero)
        manifest_path = os.path.join(out_root, "manifest.json")
        old_manifest = {}
        if os.path.exists(manifest_path):
            with open(manifest_path) as f:
                old_manifest = json.load(f)

        if not os.path.isdir(src_root):
            issues.append(f"{hero}: source drop not found at {src_root}")
            continue

        categories = resolve_hero_categories(src_root)
        for emote_key, (rel, label) in categories.items():
            folder = os.path.join(src_root, rel)
            files, nums, gaps, dupes, unnumbered = natural_frame_files(folder)
            if not files:
                issues.append(f"{hero}/{emote_key} ({label}): 0 PNGs under {rel}")
                continue
            sizes = frame_sizes(files)
            mixed = len(sizes) > 1
            native_w, native_h = sorted(sizes)[0] if not mixed else (None, None)

            if gaps:
                issues.append(f"{hero}/{emote_key} ({label}): gap(s) in frame numbers: {gaps}")
            if dupes:
                issues.append(f"{hero}/{emote_key} ({label}): duplicate frame number(s): {dupes}")
            if unnumbered:
                issues.append(
                    f"{hero}/{emote_key} ({label}): {len(unnumbered)} file(s) with no "
                    f"parseable frame number: {unnumbered[:3]}{'...' if len(unnumbered) > 3 else ''}"
                )
            if mixed:
                issues.append(f"{hero}/{emote_key} ({label}): mixed source frame sizes: {sorted(sizes)}")

            # Old built strip, if any, for comparison.
            if emote_key == "emote1":
                old_entry = old_manifest.get("profile", {}).get("idle")
            else:
                e = old_manifest.get("emotes", {}).get(emote_key)
                old_entry = (
                    old_manifest.get("profile", {}).get(e["pose"])
                    if e and "pose" in e
                    else e
                )
            old_frames = old_entry["frames"] if old_entry else None
            old_w = old_entry["frameWidth"] if old_entry else None
            old_h = old_entry["frameHeight"] if old_entry else None

            downsampled = old_frames is not None and old_frames < len(files)
            resized = (
                old_entry is not None
                and not mixed
                and (old_w != native_w or old_h != native_h)
            )

            rows.append(
                {
                    "hero": hero,
                    "emote": emote_key,
                    "label": label,
                    "src_count": len(files),
                    "src_size": f"{native_w}x{native_h}" if not mixed else "MIXED",
                    "old_frames": old_frames,
                    "old_size": f"{old_w}x{old_h}" if old_entry else "-",
                    "downsampled": downsampled,
                    "resized": resized,
                }
            )

    headers = [
        "hero", "emote", "label", "src_count", "src_size",
        "old_frames", "old_size", "downsampled", "resized",
    ]
    widths = {h: max(len(h), *(len(str(r[h])) for r in rows)) for h in headers}
    print(" ".join(h.ljust(widths[h]) for h in headers))
    for r in rows:
        print(" ".join(str(r[h]).ljust(widths[h]) for h in headers))

    if issues:
        print(f"\n{len(issues)} ISSUE(S) FOUND IN SOURCE DATA:")
        for i in issues:
            print(" -", i)
    else:
        print("\nNo gaps, duplicates, unnumbered files, or mixed sizes found.")

    n_downsampled = sum(1 for r in rows if r["downsampled"])
    n_resized = sum(1 for r in rows if r["resized"])
    print(f"\n{n_downsampled}/{len(rows)} old strips were downsampled (fewer frames than source).")
    print(f"{n_resized}/{len(rows)} old strips were resized (cell size != native source size).")


if __name__ == "__main__":
    main()
