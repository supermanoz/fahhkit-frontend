#!/usr/bin/env python3
"""Extracts each hero's dominant saturated colour from their idle sprite and
writes it into src/utils/heroStageColors.js's AUTO_COLORS table.

Source: the first frame of src/assets/heroes/<hero>/profile/idle.webp (the
same idle strip every hero already has per manifest.json - no portrait
image exists separately). Pixels that are transparent, or too close to
black/white/grey (low saturation, or near-black) are ignored, then the
remaining pixels are bucketed into 36 hue bins (10deg each) weighted by
saturation*value so vivid, bright pixels count more than dull shadow ones.
The winning bin's own pixels are averaged back into a representative
saturation/value (floored so the result reads as a punchy "stage glow"
colour, not a washed-out one).

Re-run this (`python3 scripts/extract-hero-colors.py`) whenever hero art
changes, and re-check the printed table - OVERRIDES in heroStageColors.js
always wins over whatever this script writes.
"""
import colorsys
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HEROES_DIR = os.path.join(ROOT, 'src/assets/heroes')
OUT_FILE = os.path.join(ROOT, 'src/utils/heroStageColors.js')

from PIL import Image

MIN_SATURATION = 0.18
MIN_VALUE = 0.10


def extract_hero_color(hero):
    manifest_path = os.path.join(HEROES_DIR, hero, 'manifest.json')
    manifest = json.load(open(manifest_path))
    idle = manifest['profile']['idle']
    strip = Image.open(os.path.join(HEROES_DIR, hero, idle['file'])).convert('RGBA')
    fw, fh = idle['frameWidth'], idle['frameHeight']
    frame = strip.crop((0, 0, fw, fh))
    px = frame.load()

    bins = {}
    pixels_by_bin = {}
    for y in range(fh):
        for x in range(fw):
            r, g, b, a = px[x, y]
            if a < 128:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if s < MIN_SATURATION or v < MIN_VALUE:
                continue
            hb = int(h * 36) % 36
            weight = s * v
            wsum, hsum = bins.get(hb, (0.0, 0.0))
            bins[hb] = (wsum + weight, hsum + h * weight)
            pixels_by_bin.setdefault(hb, []).append((s, v))

    if not bins:
        return None

    best_bin = max(bins.items(), key=lambda kv: kv[1][0])[0]
    wsum, hsum = bins[best_bin]
    avg_h = (hsum / wsum) if wsum > 0 else best_bin / 36

    svs = pixels_by_bin[best_bin]
    s_avg = sum(s for s, _ in svs) / len(svs)
    v_avg = sum(v for _, v in svs) / len(svs)
    s_final = min(1.0, max(s_avg, 0.55))
    v_final = min(1.0, max(v_avg, 0.75))

    rf, gf, bf = colorsys.hsv_to_rgb(avg_h, s_final, v_final)
    hexcolor = '#%02x%02x%02x' % (round(rf * 255), round(gf * 255), round(bf * 255))
    return {'stageHue': round(avg_h * 360), 'stageColor': hexcolor}


def main():
    heroes = sorted(
        h for h in os.listdir(HEROES_DIR)
        if os.path.isfile(os.path.join(HEROES_DIR, h, 'manifest.json'))
    )
    results = {}
    for hero in heroes:
        color = extract_hero_color(hero)
        if color:
            results[hero] = color
            print(f'{hero:10s} hue={color["stageHue"]:>3}  {color["stageColor"]}')
        else:
            print(f'{hero:10s} no saturated pixels found - leaving out of AUTO_COLORS')

    entries = ',\n'.join(
        f"  {hero}: {{ stageHue: {c['stageHue']}, stageColor: '{c['stageColor']}' }}"
        for hero, c in results.items()
    )
    block = f'const AUTO_COLORS = {{\n{entries},\n}}'

    src = open(OUT_FILE).read()
    pattern = re.compile(r'const AUTO_COLORS = \{.*?\n\}', flags=re.DOTALL)
    if not pattern.search(src):
        raise SystemExit(
            f'Could not find the AUTO_COLORS block to replace in {OUT_FILE}'
        )
    new_src = pattern.sub(block, src, count=1)
    open(OUT_FILE, 'w').write(new_src)
    print(f'\nWrote AUTO_COLORS for {len(results)} heroes to {OUT_FILE}')


if __name__ == '__main__':
    main()
