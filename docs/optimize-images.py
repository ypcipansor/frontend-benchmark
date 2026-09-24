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
import json
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

# Must match REPORT_SCHEMA in screenshot.js.
EXPECTED_SCHEMA = 2

# Card region in the 1440x1024 screenshots (see docs/verify-screenshots.js):
# the card spans x=420..1020 and y=114..909 for populated states. Crop with a
# small margin so the card's rounded corners and shadow stay visible. The same
# box is used for every state so montage rows line up. The bottom edge is
# computed dynamically (see compute_crop) so a taller-than-expected card is
# never clipped.
CROP = (404, 98, 1036, 926)  # left, top, right, bottom (bottom is recomputed)
OUT_WIDTH = 600


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--src', default=DEFAULT_SRC, help='captured PNG root (default: docs/screenshots)')
    parser.add_argument('--dst', default=DEFAULT_DST, help='optimized JPEG root (default: docs/images)')
    return parser.parse_args()


def load_report(src):
    """Read and validate screenshot-report.json before touching any image.

    The optimized copies feed the README and the montages, so writing them from a
    report that is missing, failed, incomplete or mixed-generation would publish
    stale or broken images. Every condition is a hard error, not a warning.
    """
    path = os.path.join(src, 'screenshot-report.json')
    if not os.path.exists(path):
        sys.exit(f'optimize-images.py: screenshot report not found: {path}')
    try:
        with open(path, encoding='utf-8') as fh:
            report = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        sys.exit(f'optimize-images.py: screenshot report is not valid JSON: {path}: {exc}')
    if not isinstance(report, dict):
        sys.exit(f'optimize-images.py: screenshot report must be a JSON object: {path}')

    meta = report.get('__meta')
    if not isinstance(meta, dict):
        sys.exit(f'optimize-images.py: screenshot report has no __meta freshness block: {path}')
    if meta.get('schema') != EXPECTED_SCHEMA:
        sys.exit(
            f"optimize-images.py: screenshot report schema {meta.get('schema')!r} != "
            f'expected {EXPECTED_SCHEMA}')
    if meta.get('fullSet') is not True:
        sys.exit(
            f"optimize-images.py: screenshot report was not a full capture "
            f"(fullSet={meta.get('fullSet')!r}); refusing to publish a partial set")
    run_id = meta.get('captureRunId')
    if not isinstance(run_id, str) or not run_id:
        sys.exit('optimize-images.py: screenshot report __meta.captureRunId is missing')

    for fw in FRAMEWORKS:
        entry = report.get(fw)
        if not isinstance(entry, dict):
            sys.exit(f'optimize-images.py: screenshot report has no entry for framework "{fw}"')
        if entry.get('failed') or entry.get('error'):
            sys.exit(f'optimize-images.py: screenshot report marks "{fw}" as failed: '
                     f"{entry.get('error')!r}")
        errors = entry.get('errors')
        if not isinstance(errors, list):
            sys.exit(f'optimize-images.py: screenshot report entry for "{fw}" has no errors list')
        if errors:
            sys.exit(f'optimize-images.py: screenshot report entry for "{fw}" recorded '
                     f'{len(errors)} console/network error(s): {errors!r}')
        if entry.get('captureRunId') != run_id:
            sys.exit(
                f'optimize-images.py: report entry for "{fw}" has captureRunId '
                f"{entry.get('captureRunId')!r}, not the run id {run_id!r} "
                f'(artefacts from different capture runs are mixed)')
    return report


def compute_crop(present):
    """One crop box for every state, with the bottom reaching the tallest card.

    The card's real bottom is detected per image as the last row of
    near-background pixels inside the card's x-range; the crop bottom is the
    maximum over all 35 PNGs plus a 17px margin, capped at the 1024px viewport.
    Using the maximum keeps the bottom row of the tallest card inside the JPEG,
    while a single shared box keeps montage rows aligned.
    """
    left, top, right, _ = CROP
    max_bottom = top
    for path in present:
        im = Image.open(path).convert('RGB')
        w, h = im.size
        lo = min(right, w)
        # Scan from just below the top: the card background is near-white; the
        # gradient backdrop behind it is not. Find the last row that still holds
        # near-background pixels within the card's columns.
        px = im.load()
        for y in range(max(top, 1), min(h, 1024)):
            row_bg = 0
            for x in range(left, lo, 4):
                r, g, b = px[x, y]
                if r > 248 and g > 248 and b > 248:
                    row_bg += 1
            if row_bg and y > max_bottom:
                max_bottom = y
    return (CROP[0], CROP[1], CROP[2], min(1024, max_bottom + 17))


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

    # With a complete set of PNGs on disk, the report must still attest that they
    # come from one clean, full capture: no image is written from a bad capture.
    load_report(src)

    crop = compute_crop(present)

    total = 0
    for f in present:
        fw = os.path.basename(os.path.dirname(f))
        name = os.path.basename(f).replace('.png', '.jpg')
        out_dir = os.path.join(dst, fw)
        os.makedirs(out_dir, exist_ok=True)
        out = os.path.join(out_dir, name)
        im = Image.open(f).convert('RGB').crop(crop)
        ratio = OUT_WIDTH / im.width
        im = im.resize((OUT_WIDTH, round(im.height * ratio)), Image.LANCZOS)
        im.save(out, 'JPEG', quality=90, optimize=True, progressive=True)
        size = os.path.getsize(out)
        total += size
        print(f'{fw}/{name:20s} {size // 1024:4d} KB')
    print(f'\nOptimized {len(present)} screenshot(s), crop {crop}, total {total / 1024 / 1024:.2f} MB')


if __name__ == '__main__':
    main()
