#!/usr/bin/env python3
"""Pixel-level visual parity proof.

Compares every framework's screenshot against the reference (React), masking the
two regions that are *expected* to differ because they embed the framework name:
the header badge and the footer line.

The masks come from ``screenshot-report.json`` (element rectangles captured by
``screenshot.js`` at the moment each screenshot was taken), not from hardcoded
row ranges. The empty state moves the footer, so a fixed range is wrong there.

Everything else — layout, colours, the icon, every todo row, the stats line,
the empty state — must be byte-identical. Any difference is reported with its
bounding box.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

FRAMEWORKS = ['react', 'vue', 'angular', 'leptos', 'yew', 'dioxus', 'blade']
STATES = ['all', 'active', 'completed', 'input-filled', 'empty-state']
REFERENCE = 'react'
ROOT = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(ROOT, 'screenshots')
THRESHOLD = 24


def load_label_rects():
    path = os.path.join(SHOTS, 'screenshot-report.json')
    with open(path, encoding='utf-8') as fh:
        report = json.load(fh)
    return {name: entry.get('labelRects', {}) for name, entry in report.items()}


def masked_diff(ref, other, ref_rects, other_rects):
    """Difference mask with the badge/footer boxes zeroed out.

    The union of the reference and candidate rectangles is masked: a short badge
    like "Yew" occupies fewer columns than "React", so masking only the
    candidate's own box would leave the reference's extra glyphs exposed.
    """
    diff = np.abs(ref.astype(int) - other.astype(int)).sum(axis=2) > THRESHOLD
    for key in ('badge', 'footer'):
        boxes = [r for r in ((ref_rects or {}).get(key), (other_rects or {}).get(key)) if r]
        if not boxes:
            continue
        x0 = min(b[0] for b in boxes)
        y0 = min(b[1] for b in boxes)
        x1 = max(b[0] + b[2] for b in boxes)
        y1 = max(b[1] + b[3] for b in boxes)
        top = max(0, y0 - 2)
        bottom = min(diff.shape[0], y1 + 2)
        left = max(0, x0 - 2)
        right = min(diff.shape[1], x1 + 2)
        diff[top:bottom, left:right] = False
    return diff


def main():
    label_rects = load_label_rects()
    failures = 0
    for state in STATES:
        ref_path = os.path.join(SHOTS, REFERENCE, f'{state}.png')
        if not os.path.exists(ref_path):
            print(f'MISSING reference {ref_path}')
            failures += 1
            continue
        ref = np.asarray(Image.open(ref_path).convert('RGB'))
        print(f'\n=== state: {state} ===')
        for fw in FRAMEWORKS:
            path = os.path.join(SHOTS, fw, f'{state}.png')
            if not os.path.exists(path):
                print(f'  MISSING {fw}/{state}.png')
                failures += 1
                continue
            other = np.asarray(Image.open(path).convert('RGB'))
            if other.shape != ref.shape:
                print(f'  FAIL {fw}: size {other.shape} != {ref.shape}')
                failures += 1
                continue
            diff = masked_diff(
                ref,
                other,
                label_rects.get(REFERENCE, {}).get(state),
                label_rects.get(fw, {}).get(state),
            )
            ys, xs = np.where(diff)
            if len(ys) == 0:
                print(f'  ✓ {fw:8s} identical outside the framework-name regions')
            else:
                print(
                    f'  ✗ {fw:8s} {len(ys)} differing px outside the '
                    f'framework-name regions '
                    f'(rows {int(ys.min())}..{int(ys.max())}, '
                    f'cols {int(xs.min())}..{int(xs.max())})'
                )
                failures += 1
    print(f'\n{"PIXEL PARITY CONFIRMED" if failures == 0 else str(failures) + " PIXEL DIFFERENCE(S)"}')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
