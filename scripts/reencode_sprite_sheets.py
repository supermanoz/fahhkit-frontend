#!/usr/bin/env python3
"""Re-encode hero sprite sheets from lossless WebP to high-quality lossy WebP.

Only the compression changes: same pixel size, same frame grid, same frame
count (manifests untouched), alpha kept lossless (alpha_quality=100). q90 was
picked by comparing idle + emote frames against the lossless originals
(~40 dB PSNR / 0.99 SSIM per frame, visually identical at 1x-3x).

Idempotent: a sheet that is already lossy VP8 is skipped. The lossless
originals stay recoverable from git history.

    python3 scripts/reencode_sprite_sheets.py [--quality 90] [root]
"""
import argparse, os, sys
from concurrent.futures import ProcessPoolExecutor
from PIL import Image

def is_lossless(path):
    with open(path, 'rb') as f:
        head = f.read(16)
    return head[12:16] == b'VP8L'

def convert(args):
    path, quality = args
    if not is_lossless(path):
        return path, 'skip', 0, 0
    before = os.path.getsize(path)
    im = Image.open(path)
    size = im.size
    im = im.convert('RGBA')
    tmp = path + '.tmp.webp'
    im.save(tmp, 'WEBP', quality=quality, alpha_quality=100, method=4)
    out = Image.open(tmp)
    assert out.size == size, f'{path}: size changed {size} -> {out.size}'
    out.close()
    os.replace(tmp, path)
    return path, 'ok', before, os.path.getsize(path)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('root', nargs='?', default='src/assets/heroes')
    ap.add_argument('--quality', type=int, default=90)
    ap.add_argument('--workers', type=int, default=2)
    a = ap.parse_args()
    files = sorted(
        os.path.join(d, f)
        for d, _, fs in os.walk(a.root)
        for f in fs
        if f.startswith('sheet') and f.endswith('.webp') and f'{os.sep}sheets{os.sep}' in os.path.join(d, f)
    )
    tb = ta = 0
    with ProcessPoolExecutor(a.workers) as ex:
        for i, (p, st, b, af) in enumerate(ex.map(convert, [(f, a.quality) for f in files]), 1):
            tb += b; ta += af
            print(f'[{i}/{len(files)}] {st} {p} {b//1024}KB -> {af//1024}KB', flush=True)
    print(f'TOTAL {tb/1e6:.0f}MB -> {ta/1e6:.0f}MB')

if __name__ == '__main__':
    sys.exit(main())
