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

A missing or incomplete report is itself a failure: without live geometry the
badge/footer masks cannot be trusted, so the checker refuses to guess.
"""
import argparse
import json
import os
import sys

try:
    import numpy as np
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit('pixel-parity.py: numpy and Pillow are required '
             '(python3 -m pip install -r requirements.txt)')

FRAMEWORKS = ['react', 'vue', 'angular', 'leptos', 'yew', 'dioxus', 'blade']
STATES = ['all', 'active', 'completed', 'input-filled', 'empty-state']
REFERENCE = 'react'
ROOT = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(ROOT, 'screenshots')
LABEL_KEYS = ('badge', 'footer')


class ReportError(Exception):
    """The screenshot report is missing, malformed or incomplete."""


def load_label_rects(path):
    """Return {framework: {state: {badge, footer}}}, failing loudly on gaps."""
    if not os.path.exists(path):
        raise ReportError(f'screenshot report not found: {path}')
    try:
        with open(path, encoding='utf-8') as fh:
            report = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        raise ReportError(f'screenshot report is not valid JSON: {path}: {exc}') from exc
    if not isinstance(report, dict):
        raise ReportError(f'screenshot report must be a JSON object: {path}')

    rects = {}
    for fw in FRAMEWORKS:
        entry = report.get(fw)
        if not isinstance(entry, dict):
            raise ReportError(f'report has no entry for framework "{fw}"')
        if entry.get('failed') or 'error' in entry:
            raise ReportError(f'report marks framework "{fw}" as failed: {entry.get("error")}')
        per_state = entry.get('labelRects')
        if not isinstance(per_state, dict):
            raise ReportError(f'report entry for "{fw}" has no labelRects')
        rects[fw] = {}
        for state in STATES:
            state_rects = per_state.get(state)
            if not isinstance(state_rects, dict):
                raise ReportError(f'report entry for "{fw}" has no labelRects for state "{state}"')
            for key in LABEL_KEYS:
                box = state_rects.get(key)
                if not isinstance(box, (list, tuple)) or len(box) != 4:
                    raise ReportError(
                        f'report entry for "{fw}" state "{state}" has no usable {key} rectangle'
                    )
                if not all(isinstance(v, (int, float)) for v in box):
                    raise ReportError(
                        f'report entry for "{fw}" state "{state}" {key} rectangle is not numeric'
                    )
            rects[fw][state] = state_rects
    return rects


def clamp_box(box, height, width):
    """Validate a rectangle against the image and clamp its padding to the frame."""
    x, y, w, h = (float(v) for v in box)
    if w <= 0 or h <= 0:
        raise ReportError(f'degenerate rectangle {box}')
    x0 = max(0, int(x) - 2)
    y0 = max(0, int(y) - 2)
    x1 = min(width, int(x + w) + 2)
    y1 = min(height, int(y + h) + 2)
    if x0 >= width or y0 >= height:
        raise ReportError(f'rectangle {box} lies outside the {width}x{height} screenshot')
    return x0, y0, x1, y1


def masked_diff(ref, other, ref_rects, other_rects):
    """Difference mask with the badge/footer boxes zeroed out.

    Equality is exact per RGB channel: a single unit of change in any channel,
    anywhere outside the two masked regions, counts as a difference. There is no
    colour tolerance, because the contract the docs state is byte-identity.

    The union of the reference and candidate rectangles is masked: a short badge
    like "Yew" occupies fewer columns than "React", so masking only the
    candidate's own box would leave the reference's extra glyphs exposed.
    """
    diff = np.any(ref != other, axis=2)
    for key in LABEL_KEYS:
        boxes = []
        for rects in (ref_rects, other_rects):
            box = rects.get(key)
            if box is None:
                raise ReportError(f'required {key} rectangle missing from the report')
            boxes.append(box)
        x0 = min(clamp_box(b, diff.shape[0], diff.shape[1])[0] for b in boxes)
        y0 = min(clamp_box(b, diff.shape[0], diff.shape[1])[1] for b in boxes)
        x1 = max(clamp_box(b, diff.shape[0], diff.shape[1])[2] for b in boxes)
        y1 = max(clamp_box(b, diff.shape[0], diff.shape[1])[3] for b in boxes)
        diff[y0:y1, x0:x1] = False
    return diff


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--shots', default=SHOTS, help='screenshot root (default: docs/screenshots)')
    args = parser.parse_args()
    shots = os.path.abspath(args.shots)

    try:
        label_rects = load_label_rects(os.path.join(shots, 'screenshot-report.json'))
    except ReportError as exc:
        print(f'pixel-parity.py: {exc}')
        sys.exit(1)

    failures = 0
    for state in STATES:
        ref_path = os.path.join(shots, REFERENCE, f'{state}.png')
        if not os.path.exists(ref_path):
            print(f'MISSING reference {ref_path}')
            failures += 1
            continue
        ref = np.asarray(Image.open(ref_path).convert('RGB'))
        print(f'\n=== state: {state} ===')
        for fw in FRAMEWORKS:
            path = os.path.join(shots, fw, f'{state}.png')
            if not os.path.exists(path):
                print(f'  MISSING {fw}/{state}.png')
                failures += 1
                continue
            other = np.asarray(Image.open(path).convert('RGB'))
            if other.shape != ref.shape:
                print(f'  FAIL {fw}: size {other.shape} != {ref.shape}')
                failures += 1
                continue
            try:
                diff = masked_diff(
                    ref,
                    other,
                    label_rects.get(REFERENCE, {}).get(state, {}),
                    label_rects.get(fw, {}).get(state, {}),
                )
            except ReportError as exc:
                print(f'  FAIL {fw}: {exc}')
                failures += 1
                continue
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
