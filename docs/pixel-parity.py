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
import math
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
# Must match REPORT_SCHEMA in screenshot.js.
EXPECTED_SCHEMA = 2
# The capture viewport and the resulting pixel dimensions. The images come from
# screenshot.js at deviceScaleFactor 1; a reference at any other size means the
# report and the images disagree, so the comparison would be meaningless.
VIEWPORT_W = 1440
VIEWPORT_H = 1024


class ReportError(Exception):
    """The screenshot report is missing, malformed or incomplete."""


def check_freshness(report):
    """Require one capture generation across all seven frameworks.

    The pixel contract compares live geometry against images, so mixing images
    from different capture runs would make the mask meaningless. The report must
    carry the __meta block written by screenshot.js and every framework entry
    must share its captureRunId.
    """
    meta = report.get('__meta')
    if not isinstance(meta, dict):
        raise ReportError('screenshot report has no __meta freshness block')
    if meta.get('schema') != EXPECTED_SCHEMA:
        raise ReportError(
            f"screenshot report schema {meta.get('schema')!r} != expected {EXPECTED_SCHEMA}")
    if meta.get('fullSet') is not True:
        raise ReportError(
            f"screenshot report was not a full capture (fullSet={meta.get('fullSet')!r})")
    run_id = meta.get('captureRunId')
    if not isinstance(run_id, str) or not run_id:
        raise ReportError('screenshot report __meta.captureRunId is missing')
    for fw in FRAMEWORKS:
        entry = report.get(fw)
        if not isinstance(entry, dict):
            raise ReportError(f'report has no entry for framework "{fw}"')
        if entry.get('captureRunId') != run_id:
            raise ReportError(
                f'report entry for "{fw}" has captureRunId '
                f"{entry.get('captureRunId')!r}, not the run id {run_id!r} "
                f'(artefacts from different capture runs are mixed)')


def entry_dpr(entry):
    """The deviceScaleFactor recorded for a report entry (default 1)."""
    viewport = entry.get('viewport') if isinstance(entry, dict) else None
    if not isinstance(viewport, dict):
        return None
    dpr = viewport.get('deviceScaleFactor', 1)
    if not isinstance(dpr, (int, float)) or isinstance(dpr, bool) or dpr <= 0:
        return None
    return float(dpr)


def report_dpr(entries, fw):
    """The DPR for `fw` from the entries map built by load_label_rects."""
    return entries['__dpr'].get(fw, 1)


def load_label_rects(path):
    """Return {framework: {state: {badge, footer}}}, failing loudly on gaps.

    The returned map carries an extra ``__dpr`` entry with per-framework DPRs so
    the caller can assert the reference image really is the declared viewport.
    """
    if not os.path.exists(path):
        raise ReportError(f'screenshot report not found: {path}')
    try:
        with open(path, encoding='utf-8') as fh:
            report = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        raise ReportError(f'screenshot report is not valid JSON: {path}: {exc}') from exc
    if not isinstance(report, dict):
        raise ReportError(f'screenshot report must be a JSON object: {path}')

    check_freshness(report)

    rects = {'__dpr': {}}
    for fw in FRAMEWORKS:
        entry = report.get(fw)
        if not isinstance(entry, dict):
            raise ReportError(f'report has no entry for framework "{fw}"')
        if entry.get('failed') or 'error' in entry:
            raise ReportError(f'report marks framework "{fw}" as failed: {entry.get("error")}')
        viewport = entry.get('viewport')
        if not isinstance(viewport, dict):
            raise ReportError(f'report entry for "{fw}" has no viewport')
        if viewport.get('width') != VIEWPORT_W or viewport.get('height') != VIEWPORT_H:
            raise ReportError(
                f'report entry for "{fw}" viewport '
                f'{viewport.get("width")}x{viewport.get("height")} != expected '
                f'{VIEWPORT_W}x{VIEWPORT_H}')
        dpr = entry_dpr(entry)
        if dpr is None:
            raise ReportError(
                f'report entry for "{fw}" has an invalid deviceScaleFactor '
                f'({viewport.get("deviceScaleFactor")!r})')
        rects['__dpr'][fw] = dpr
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
    """Validate a rectangle against the image and clamp its padding to the frame.

    The rectangle comes from a JSON report, so it is untrusted input that is
    about to become a NumPy slice. Every rejection here exists because the naive
    version silently masked the *wrong* pixels:

    * a non-finite value (NaN/inf) makes the int() conversion raise or produce a
      nonsense bound;
    * a zero or negative width/height describes no area at all;
    * a rectangle entirely left of or above the image yields a negative x1/y1 —
      and NumPy reads a negative endpoint as an offset *from the end of the
      array*, so the mask would land on unrelated pixels at the opposite edge;
    * a rectangle entirely right of or below the image yields x0 >= width (an
      empty slice), hiding a difference that should have been cleared.

    Only a rectangle that genuinely overlaps the image is clamped, and the result
    is always a valid, non-empty, in-bounds slice: 0 <= x0 < x1 <= width and
    0 <= y0 < y1 <= height. A negative index is never handed to NumPy.
    """
    values = [float(v) for v in box]
    if not all(math.isfinite(v) for v in values):
        raise ReportError(f'non-finite rectangle {box!r}')
    x, y, w, h = values
    if w <= 0 or h <= 0:
        raise ReportError(f'degenerate rectangle {box!r} (width/height must be positive)')

    # The rectangle must intersect the image at all: a box wholly off any edge is
    # a report bug, not something to mask away.
    if x + w <= 0 or y + h <= 0 or x >= width or y >= height:
        raise ReportError(
            f'rectangle {box!r} does not overlap the {width}x{height} screenshot')

    x0 = max(0, int(x) - 2)
    y0 = max(0, int(y) - 2)
    x1 = min(width, int(math.ceil(x + w)) + 2)
    y1 = min(height, int(math.ceil(y + h)) + 2)

    if not (0 <= x0 < x1 <= width and 0 <= y0 < y1 <= height):
        raise ReportError(
            f'rectangle {box!r} produced an out-of-bounds slice '
            f'({x0},{y0})-({x1},{y1}) for a {width}x{height} screenshot')
    return x0, y0, x1, y1


def masked_diff(ref, other, ref_rects, other_rects):
    """Difference mask with the badge/footer boxes zeroed out.

    Equality is exact per RGB channel: a single unit of change in any channel,
    anywhere outside the masked regions, counts as a difference. There is no
    colour tolerance, because the contract the docs state is byte-identity.

    Each rectangle is masked on its own; the union of the *actual* reference and
    candidate rectangles is *not* turned into a bounding hull. Masking the hull
    would also hide everything between two non-overlapping boxes — a short badge
    like "Yew" sits entirely inside "React"'s columns, but the footer is wide
    enough that a hull spanning badge and footer could swallow unrelated rows. A
    real difference in that gap must still fail, so only the rectangles
    themselves (plus their per-rectangle padding) are cleared.
    """
    diff = np.any(ref != other, axis=2)
    for key in LABEL_KEYS:
        for rects in (ref_rects, other_rects):
            box = rects.get(key)
            if box is None:
                raise ReportError(f'required {key} rectangle missing from the report')
            x0, y0, x1, y1 = clamp_box(box, diff.shape[0], diff.shape[1])
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
        # The reference must be the capture viewport at the entry's DPR. A
        # different size means the report's masks and the image disagree, so the
        # comparison could silently pass on meaningless pixels.
        dpr = report_dpr(label_rects, REFERENCE)
        exp_w, exp_h = round(VIEWPORT_W * dpr), round(VIEWPORT_H * dpr)
        if ref.shape[1] != exp_w or ref.shape[0] != exp_h:
            print(f'  FAIL reference {REFERENCE}/{state}.png size '
                  f'{ref.shape[1]}x{ref.shape[0]} != expected {exp_w}x{exp_h}')
            failures += 1
            continue
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
