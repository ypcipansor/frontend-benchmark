#!/usr/bin/env python3
"""Generate README-optimized, card-cropped copies of the captured screenshots.

Full-resolution page screenshots live in docs/screenshots/<framework>/ and are
kept as the authoritative artifacts. Because every framework renders the exact
same 600px card at the same place, the optimized copies in docs/images/ are
cropped to that card so the README shows the app itself rather than a large
empty gradient around it.

Every input path is derived from this file's location, so the script works from
any checkout and from any working directory.
"""
import argparse
import glob
import os
import sys

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("optimize-images.py: Pillow is required (python3 -m pip install -r requirements.txt)")

ROOT = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SRC = os.path.join(ROOT, 'screenshots')
DEFAULT_DST = os.path.join(ROOT, 'images')

FRAMEWORKS = ['react', 'vue', 'angular', 'leptos', 'yew', 'dioxus', 'blade']
STATES = ['all', 'active', 'completed', 'input-filled', 'empty-state']

# Card region in the 1440x1024 screenshots (see docs/verify-screenshots.js):
# the card spans x=420..1020 and y=114..909 for populated states. Crop with a
# small margin so the card's rounded corners and shadow stay visible. The same
# box is used for every state so montage rows line up.
CROP = (404, 98, 1036, 926)  # left, top, right, bottom
OUT_WIDTH = 600


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--src', default=DEFAULT_SRC, help='captured PNG root (default: docs/screenshots)')
    parser.add_argument('--dst', default=DEFAULT_DST, help='optimized JPEG root (default: docs/images)')
    return parser.parse_args()


def main():
    args = parse_args()
    src = os.path.abspath(args.src)
    dst = os.path.abspath(args.dst)

    if not os.path.isdir(src):
        sys.exit(f'optimize-images.py: source directory not found: {src}')

    missing = []
    present = []
    for fw in FRAMEWORKS:
        for state in STATES:
            png = os.path.join(src, fw, f'{state}.png')
            if os.path.exists(png):
                present.append(png)
            else:
                missing.append(os.path.relpath(png, src))
    if missing:
        sys.exit(
            'optimize-images.py: required screenshots are missing, refusing to write a '
            'partial set:\n  ' + '\n  '.join(missing)
        )
    if not present:
        sys.exit(f'optimize-images.py: no screenshots found under {src}')

    total = 0
    for f in present:
        fw = os.path.basename(os.path.dirname(f))
        name = os.path.basename(f).replace('.png', '.jpg')
        out_dir = os.path.join(dst, fw)
        os.makedirs(out_dir, exist_ok=True)
        out = os.path.join(out_dir, name)
        im = Image.open(f).convert('RGB').crop(CROP)
        ratio = OUT_WIDTH / im.width
        im = im.resize((OUT_WIDTH, round(im.height * ratio)), Image.LANCZOS)
        im.save(out, 'JPEG', quality=90, optimize=True, progressive=True)
        size = os.path.getsize(out)
        total += size
        print(f'{fw}/{name:20s} {size // 1024:4d} KB')
    print(f'\nOptimized {len(present)} screenshot(s), total {total / 1024 / 1024:.2f} MB')


if __name__ == '__main__':
    main()
