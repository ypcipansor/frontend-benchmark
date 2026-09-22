#!/usr/bin/env python3
"""Generate README-optimized, card-cropped copies of the captured screenshots.

Full-resolution page screenshots live in docs/screenshots/<framework>/ and are
kept as the authoritative artifacts. Because every framework renders the exact
same 600px card at the same place, the optimized copies in docs/images/ are
cropped to that card so the README shows the app itself rather than a large
empty gradient around it.
"""
import os
import glob
from PIL import Image

SRC = '/workspace/project/frontend-benchmark/docs/screenshots'
DST = '/workspace/project/frontend-benchmark/docs/images'

# Card region in the 1440x1024 screenshots (see docs/verify-screenshots.js):
# the card spans x=420..1020 and y=114..909 for populated states. Crop with a
# small margin so the card's rounded corners and shadow stay visible. The same
# box is used for every state so montage rows line up.
CROP = (404, 98, 1036, 926)  # left, top, right, bottom
OUT_WIDTH = 600

os.makedirs(DST, exist_ok=True)
total = 0
for f in sorted(glob.glob(os.path.join(SRC, '*', '*.png'))):
    fw = os.path.basename(os.path.dirname(f))
    name = os.path.basename(f).replace('.png', '.jpg')
    out_dir = os.path.join(DST, fw)
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, name)
    im = Image.open(f).convert('RGB').crop(CROP)
    ratio = OUT_WIDTH / im.width
    im = im.resize((OUT_WIDTH, round(im.height * ratio)), Image.LANCZOS)
    im.save(out, 'JPEG', quality=90, optimize=True, progressive=True)
    size = os.path.getsize(out)
    total += size
    print(f'{fw}/{name:20s} {size // 1024:4d} KB')
print(f'\nTotal optimized: {total / 1024 / 1024:.2f} MB')
