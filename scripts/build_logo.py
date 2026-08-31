"""Turn the supplied logo artwork into the two files the app ships.

    python scripts/build_logo.py "C:/Users/FSD/Desktop/Logo  improved.jpg"

WHY THIS IS A SCRIPT AND NOT SOMETHING DONE BY HAND. The logo has been replaced twice, and each time
the same work had to be redone from memory: find the artwork inside the empty margin, cut the paper
away without eating the mark's own light areas, recolour ONLY the wordmark for dark shells, and
re-encode small. Doing that by hand is how the two variants drift out of register with each other.

WHAT IT PRODUCES
    client/public/logo-lockup.webp        light shells — the artwork's own ink
    client/public/logo-lockup-dark.webp   dark shells  — the SAME letterforms in near-white

THE ARTWORK IS NOT REDRAWN. It is cropped, its background is removed, the wordmark is recoloured for
the dark variant, and it is resized. No re-typesetting: the letterforms are the supplied ones, cut
from the supplied pixels.

THE BACKGROUND IS REMOVED BY CONNECTION, NOT BY BRIGHTNESS. A brightness threshold also eats the
mark's own light areas — the pages of the journal are nearly as pale as the paper behind it. Only
"pale AND reachable from the edge of the picture" is background.

THE WORDMARK IS CUT AS A COVERAGE MASK, NOT SWAPPED ABOVE A THRESHOLD. Swapping every pixel darker
than some value leaves the half-tone pixels at the edge of each letter at their original grey, which
speckles the letters on a dark shell — visible, and the first version of this did exactly that.
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

# The artwork's own bounds inside the supplied file, and the blank rows between mark and wordmark.
# Measured, not guessed — re-measure with the block at the bottom if the artwork is ever replaced.
CONTENT = (185, 163, 1004, 541)
WORDMARK_TOP = 469
PAD = 26                      # a little of its own ground, so the mark is not cropped flush

OUT_H = 180                   # 3x the ~60px display height: sharp on a 3x panel, still tiny
INK_LIGHT = (51, 58, 66)      # the artwork's own wordmark ink, flattened
INK_DARK = (241, 245, 249)    # #F1F5F9 — the app's light-on-dark ink
PAPER_LUM, INK_LUM = 240.0, 65.0
MIN_ISLAND = 12               # px: paper speckles the flood fill cannot reach from the edge


def _background_alpha(c: np.ndarray) -> np.ndarray:
    """255 where the artwork is, 0 where its paper ground is."""
    pale = c.mean(axis=2) > 205
    lab, _ = ndimage.label(pale)
    edge = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    edge.discard(0)
    alpha = np.where(np.isin(lab, list(edge)), 0.0, 255.0)

    # Paper that the flood fill could not reach — vignetted corners, texture — survives as small
    # islands and reads as dirt around the mark. Drop anything too small to be part of the artwork.
    solid, n = ndimage.label(alpha > 0)
    if n:
        sizes = ndimage.sum(np.ones_like(solid), solid, range(1, n + 1))
        for i, size in enumerate(sizes, start=1):
            if size < MIN_ISLAND:
                alpha[solid == i] = 0.0
    return ndimage.gaussian_filter(alpha, 0.6)


def build(src: str, dark: bool) -> Image.Image:
    x0, y0, x1, y1 = CONTENT
    c = np.asarray(Image.open(src).convert('RGB')
                   .crop((x0 - PAD, y0 - PAD, x1 + PAD, y1 + PAD))).astype(float)

    alpha = _background_alpha(c)
    rgb = c.copy()

    ty = WORDMARK_TOP - (y0 - PAD)
    lum = c[ty:, :, :].mean(axis=2)
    coverage = np.clip((PAPER_LUM - lum) / (PAPER_LUM - INK_LUM), 0.0, 1.0)
    coverage = np.where(coverage < 0.12, 0.0, coverage)   # paper texture and the soft drop-shadow
    rgb[ty:, :, :] = np.array(INK_DARK if dark else INK_LIGHT)
    alpha[ty:, :] = coverage * 255.0

    out = Image.fromarray(np.dstack([rgb.clip(0, 255), alpha.clip(0, 255)]).astype(np.uint8), 'RGBA')
    w = round(out.size[0] * OUT_H / out.size[1])
    return out.resize((w, OUT_H), Image.LANCZOS)


def main() -> None:
    src = sys.argv[1] if len(sys.argv) > 1 else r'C:\Users\FSD\Desktop\Logo  improved.jpg'
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for dark, name in ((False, 'logo-lockup.webp'), (True, 'logo-lockup-dark.webp')):
        img = build(src, dark)
        path = os.path.join(here, 'client', 'public', name)
        img.save(path, 'WEBP', quality=90, method=6)
        print(f'{name:26} {img.size[0]}x{img.size[1]}  {os.path.getsize(path):,} bytes')


if __name__ == '__main__':
    main()
