#!/usr/bin/env python3
"""Trim + downscale every hero sprite sequence (idle + emotes), all frames kept.

For each src/assets/heroes/<hero>/sheets/<key>/ (read from an ORIGINALS tree,
never from the destination):
  1. union alpha bounding box across ALL frames  -> `trim` {x,y,w,h} in the
     original frame's pixels (so on-screen position/scale are unchanged: the
     player draws the trimmed frame back at that offset inside the full box);
  2. downscale so the FULL box (frameHeight) would be --height px tall
     (never upscaled), i.e. 375 = 1.5x, 312 = 1.25x, 250 = 1x of the 250px
     Shop card;
  3. repack (<= 4096px per side) as lossy WebP, lossless alpha.
manifest.json keeps frameWidth/frameHeight = the ORIGINAL full-box size (layout
consumers - TerritoryMap's HUD marker math, AnimatedSprite's box - rely on it)
and gains `trim`, `sheetFrameWidth`, `sheetFrameHeight`. poster.webp is copied
untouched (full box).

    trim_downscale_sprites.py analyze ORIGINALS_ROOT BBOX_JSON
    trim_downscale_sprites.py report  ORIGINALS_ROOT BBOX_JSON
    trim_downscale_sprites.py apply   ORIGINALS_ROOT BBOX_JSON DEST_ROOT --height 312
"""
import argparse, json, math, os, shutil, sys
from concurrent.futures import ProcessPoolExecutor
from PIL import Image

MAX_DIM = 4096
PAD = 1


def seqs(root):
    for hero in sorted(os.listdir(root)):
        sd = os.path.join(root, hero, 'sheets')
        if os.path.isdir(sd):
            for key in sorted(os.listdir(sd)):
                if os.path.exists(os.path.join(sd, key, 'manifest.json')):
                    yield hero, key, os.path.join(sd, key)


def frames_of(d):
    m = json.load(open(os.path.join(d, 'manifest.json')))
    fw, fh = m['frameWidth'], m['frameHeight']
    for s in m['sheets']:
        im = Image.open(os.path.join(d, s['file'])).convert('RGBA')
        for i in range(s['frames']):
            c, r = i % s['cols'], i // s['cols']
            yield im.crop((c * fw, r * fh, (c + 1) * fw, (r + 1) * fh))


def bbox_job(args):
    hero, key, d = args
    m = json.load(open(os.path.join(d, 'manifest.json')))
    x0 = y0 = 10**9
    x1 = y1 = 0
    n = 0
    for f in frames_of(d):
        n += 1
        b = f.getchannel('A').point(lambda v: 255 if v > 0 else 0).getbbox()
        if b:
            x0, y0, x1, y1 = min(x0, b[0]), min(y0, b[1]), max(x1, b[2]), max(y1, b[3])
    assert n == m['frameCount'], (d, n, m['frameCount'])
    fw, fh = m['frameWidth'], m['frameHeight']
    x0, y0 = max(0, x0 - PAD), max(0, y0 - PAD)
    x1, y1 = min(fw, x1 + PAD), min(fh, y1 + PAD)
    return f'{hero}/{key}', dict(fw=fw, fh=fh, frames=n, x=x0, y=y0, w=x1 - x0, h=y1 - y0)


def geometry(b, height):
    s = min(1.0, height / b['fh'])
    tw, th = max(1, round(b['w'] * s)), max(1, round(b['h'] * s))
    cols = max(1, min(b['frames'], MAX_DIM // tw))
    per = cols * max(1, MAX_DIM // th)
    sheets, left = [], b['frames']
    while left > 0:
        n = min(per, left)
        c = min(cols, n)
        sheets.append((c, math.ceil(n / c), n))
        left -= n
    return s, tw, th, sheets


def decoded_mb(b, height):
    _, tw, th, sheets = geometry(b, height)
    return sum(c * tw * r * th * 4 for c, r, _ in sheets) / 1048576


def apply_job(args):
    hero, key, src, dst, b, height, quality = args
    m = json.load(open(os.path.join(src, 'manifest.json')))
    s, tw, th, sheets = geometry(b, height)
    os.makedirs(dst, exist_ok=True)
    frames = (f.crop((b['x'], b['y'], b['x'] + b['w'], b['y'] + b['h'])) for f in frames_of(src))
    out, buf = [], []
    def flush():
        i = len(out)
        c, r, n = sheets[i]
        sheet = Image.new('RGBA', (c * tw, r * th), (0, 0, 0, 0))
        for k, f in enumerate(buf):
            sheet.paste(f, ((k % c) * tw, (k // c) * th))
        name = f'sheet{i}.webp'
        sheet.save(os.path.join(dst, name), 'WEBP', quality=quality, alpha_quality=100, method=4)
        out.append({'file': name, 'cols': c, 'rows': r, 'frames': n})
        buf.clear()
    for f in frames:
        if s < 1.0:
            f = f.resize((tw, th), Image.LANCZOS)
        buf.append(f)
        if len(buf) == sheets[len(out)][2]:
            flush()
    nm = dict(m)
    nm['sheets'] = out
    nm['trim'] = {k: b[k] for k in 'xywh'}
    nm['sheetFrameWidth'], nm['sheetFrameHeight'] = tw, th
    json.dump(nm, open(os.path.join(dst, 'manifest.json'), 'w'), indent=2)
    if m.get('poster'):
        shutil.copy(os.path.join(src, m['poster']), os.path.join(dst, m['poster']))
    kb = sum(os.path.getsize(os.path.join(dst, o['file'])) for o in out) / 1024
    return f'{hero}/{key}', kb


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('mode', choices=['analyze', 'report', 'apply'])
    ap.add_argument('root')
    ap.add_argument('bbox')
    ap.add_argument('dest', nargs='?')
    ap.add_argument('--height', type=int, default=312)
    ap.add_argument('--quality', type=int, default=75)
    ap.add_argument('--workers', type=int, default=4)
    a = ap.parse_args()
    if a.mode == 'analyze':
        with ProcessPoolExecutor(a.workers) as ex:
            res = dict(ex.map(bbox_job, list(seqs(a.root))))
        json.dump(res, open(a.bbox, 'w'), indent=1)
        print(f'{len(res)} sequences')
        return
    bb = json.load(open(a.bbox))
    if a.mode == 'report':
        heroes = sorted({k.split('/')[0] for k in bb})
        for h in (250, 312, 375):
            print(f'--- full-box height {h}px ({h/250:.2f}x of the 250px card)')
            for hero in heroes:
                idle = decoded_mb(bb[f'{hero}/idle'], h)
                em = {k: decoded_mb(v, h) for k, v in bb.items() if k.startswith(hero + '/') and not k.endswith('/idle')}
                big = max(em, key=em.get)
                print(f'{hero:9s} idle {idle:5.1f}MB  largest emote {big.split("/")[1]} {em[big]:5.1f}MB  idle+emote {idle+em[big]:5.1f}MB')
        return
    jobs = []
    for hero, key, d in seqs(a.root):
        jobs.append((hero, key, d, os.path.join(a.dest, hero, 'sheets', key), bb[f'{hero}/{key}'], a.height, a.quality))
    tot = 0
    with ProcessPoolExecutor(a.workers) as ex:
        for i, (name, kb) in enumerate(ex.map(apply_job, jobs), 1):
            tot += kb
            print(f'[{i}/{len(jobs)}] {name} {kb:.0f}KB', flush=True)
    print(f'TOTAL sheets {tot/1024:.1f}MB')


if __name__ == '__main__':
    sys.exit(main())
