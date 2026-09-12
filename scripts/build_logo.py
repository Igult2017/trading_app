"""Turn the supplied logo artwork into the two files the app ships.

    python scripts/build_logo.py "C:/Users/FSD/Desktop/Trade&Journal.png"

WHY THIS IS A SCRIPT AND NOT SOMETHING DONE BY HAND. The logo has now been replaced three times,
and each time the same work had to be redone from memory: find the artwork inside its empty margin,
recolour it for dark shells, re-encode it small. Doing that by hand is how the two variants drift
out of register with each other.

WHAT IT PRODUCES
    client/public/logo-lockup.webp        light shells — the artwork's own ink
    client/public/logo-lockup-dark.webp   dark shells  — the SAME artwork in near-white
    client/public/favicon.png             the browser tab — just the mark, on a brand tile

THE TAB ICON COMES FROM THE SAME FILE, which it did not before. `favicon.svg` was a hand-drawn
navy square with a green arrow — a different mark from the logo entirely, so the tab and the header
disagreed about what this product's symbol is. The mark is cut out of the supplied artwork at the
one fully-blank column between it and the lettering, so it cannot drift from the logo again.

THE ARTWORK IS NOT REDRAWN. It is trimmed, recoloured for the dark variant, and resized. No
re-typesetting: the letterforms are the supplied ones, cut from the supplied pixels.

REWRITTEN 2026-09-12 FOR A DIFFERENT KIND OF FILE. The previous artwork was a JPEG of a printed
lockup, so most of this script was machinery for removing a paper ground without eating the mark's
own pale areas — background-by-connection, a coverage mask, a haze filter. The current artwork
(`Trade&Journal.png`) arrives as a PNG that is ALREADY transparent and is a single flat ink, so
none of that has an input any more and it is gone; git has it if a printed original ever comes
back. What is left is what this file actually needs.

IT ALSO STAMPS A CACHE-BUSTING VERSION, and that is not cosmetic. The two logo files live at
FIXED paths under public/ — unlike everything in assets/, whose names carry a content hash — and
they are served with `Cache-Control: public, max-age=3600`. So after a logo change every browser
that had seen the old one kept showing it for up to an hour, with no way to know it had changed.
That happened on this very change: the new logo was live and correct on the server while he was
still looking at the old one, which reads exactly like the work was never done. The script now
writes `?v=<hash of the artwork>` into BOTH the preload in index.html and the src in Wordmark.tsx,
so a new logo is a new URL and appears immediately. Both are written from the same variable here,
because keeping two files in sync by hand is the drift this whole script exists to prevent.

THE SHAPE CHANGED TOO, AND IT MATTERS MORE THAN THE COLOURS. The old lockup stacked the mark above
the name at 2.03:1. This one sets them side by side at 6.22:1 — three times wider for the same
height. Anywhere that sized the logo by HEIGHT now renders it three times wider than before, which
is why `Wordmark.tsx` had to change with it rather than just pointing at a new file.
"""
import hashlib
import os
import re
import sys

import numpy as np
from PIL import Image, ImageDraw

OUT_H = 160                   # ~4x the largest place it is displayed; sharp on a 3x panel, still small
INK_DARK = (241, 245, 249)    # #F1F5F9 — the app's light-on-dark ink
INK_TILE = (28, 44, 52)       # the artwork's own ink, measured — the tab tile's ground
PAD_FRAC = 0.04               # a sliver of breathing room, as a share of the trimmed height
ALPHA_FLOOR = 8               # below this it is the file's empty margin, not artwork

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(HERE, "client", "public")


def trim(im: Image.Image) -> Image.Image:
    """Cut the empty margin off. The supplied file is 59% empty vertically; left in, every call
    site would be sizing mostly nothing and the logo would look small and float oddly."""
    a = np.array(im)
    ys, xs = np.where(a[:, :, 3] > ALPHA_FLOOR)
    if not len(xs):
        raise SystemExit("that file is empty — every pixel is transparent")
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    pad = max(1, int((y1 - y0 + 1) * PAD_FRAC))
    box = (max(0, x0 - pad), max(0, y0 - pad),
           min(im.width, x1 + 1 + pad), min(im.height, y1 + 1 + pad))
    return im.crop(box)


def recolour(im: Image.Image, rgb) -> Image.Image:
    """Repaint the ink, keep the edges.

    The alpha channel already carries how much of each pixel is ink — including the soft pixels
    along every curve. So replacing only the COLOUR and leaving alpha alone keeps the letterforms
    exactly as drawn. Thresholding the colour instead would leave the half-covered edge pixels at
    their original dark value and speckle the letters on a dark shell; that was a real defect in an
    earlier version of this script."""
    a = np.array(im)
    a[:, :, 0], a[:, :, 1], a[:, :, 2] = rgb
    return Image.fromarray(a, "RGBA")


def favicon(art: Image.Image) -> Image.Image:
    """Just the mark, white, on a rounded brand-ink tile.

    WHY A TILE AND NOT THE BARE MARK. The artwork's ink is near-black, and a bare dark mark on a
    transparent ground disappears in a dark browser tab strip — which is where the old logo's
    invisibility problem came from in the first place. A tile is legible in both.

    WHERE THE CUT IS. `find_mark_split` looks for a fully-blank column between the mark and the
    first letter rather than taking a fixed fraction, so it stays right if the spacing changes."""
    cut = find_mark_split(art)
    mark = art.crop((0, 0, cut, art.height))
    # trim the mark's own margin back off after the cut
    a = np.array(mark)
    ys, xs = np.where(a[:, :, 3] > ALPHA_FLOOR)
    mark = mark.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    mark = recolour(mark, INK_DARK)

    S, INSET = 512, 96
    box = S - INSET * 2
    scale = min(box / mark.width, box / mark.height)
    mark = mark.resize((max(1, round(mark.width * scale)), max(1, round(mark.height * scale))), Image.LANCZOS)

    tile = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(tile).rounded_rectangle([0, 0, S - 1, S - 1], radius=112, fill=INK_TILE + (255,))
    tile.alpha_composite(mark, ((S - mark.width) // 2, (S - mark.height) // 2))
    return tile


def find_mark_split(art: Image.Image) -> int:
    """The x of the blank gutter between the mark and the lettering."""
    cols = (np.array(art)[:, :, 3] > ALPHA_FLOOR).sum(axis=0)
    # search the left half only — the gaps between words further right are not the one we want
    for x in range(int(art.width * 0.10), int(art.width * 0.45)):
        if cols[x] == 0:
            return x
    raise SystemExit("no blank column between the mark and the lettering — check the artwork")


def stamp(ver: str) -> None:
    """Write ?v=<ver> onto every reference to the two logo files.

    Both the preload and the render must carry the SAME query or the browser fetches the file
    twice — once for a preload nothing uses, once for the image. Writing both from here is what
    keeps them equal."""
    targets = [
        os.path.join(HERE, "client", "index.html"),
        os.path.join(HERE, "client", "src", "components", "Wordmark.tsx"),
    ]
    # the favicon too — browsers cache a tab icon harder than anything else on the page
    pat = re.compile(r"(/logo-lockup(?:-dark)?\.webp|/favicon\.png)(\?v=[0-9a-f]+)?")
    for t in targets:
        with open(t, encoding="utf-8", newline="") as fh:
            before = fh.read()
        after, n = pat.subn(lambda m: m.group(1) + "?v=" + ver, before)
        if n and after != before:
            with open(t, "w", encoding="utf-8", newline="") as fh:
                fh.write(after)
        print("  stamped %-16s %d reference(s)" % (os.path.basename(t), n))


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    src = sys.argv[1]
    im = Image.open(src).convert("RGBA")
    print("source        : %s  %dx%d" % (os.path.basename(src), im.width, im.height))

    art = trim(im)
    print("trimmed       : %dx%d   aspect %.2f:1" % (art.width, art.height, art.width / art.height))

    out_w = round(art.width * OUT_H / art.height)
    art = art.resize((out_w, OUT_H), Image.LANCZOS)

    os.makedirs(OUT_DIR, exist_ok=True)
    light = os.path.join(OUT_DIR, "logo-lockup.webp")
    dark = os.path.join(OUT_DIR, "logo-lockup-dark.webp")
    art.save(light, "WEBP", quality=92, method=6)
    recolour(art, INK_DARK).save(dark, "WEBP", quality=92, method=6)

    print("light shells  : %s  %dx%d  %.1f KB" % (os.path.basename(light), out_w, OUT_H, os.path.getsize(light) / 1024))
    print("dark shells   : %s  %dx%d  %.1f KB" % (os.path.basename(dark), out_w, OUT_H, os.path.getsize(dark) / 1024))

    ico = os.path.join(OUT_DIR, "favicon.png")
    favicon(trim(im)).save(ico, "PNG", optimize=True)
    print("browser tab   : %s  512x512  %.1f KB" % (os.path.basename(ico), os.path.getsize(ico) / 1024))
    ver = hashlib.sha1(open(light, "rb").read()).hexdigest()[:8]
    stamp(ver)
    print("cache version : ?v=%s  (written into index.html and Wordmark.tsx)" % ver)
    print()
    print("NOW UPDATE Wordmark.tsx BY HAND: NATURAL_W=%d NATURAL_H=%d (aspect %.2f:1)" % (out_w, OUT_H, out_w / OUT_H))


if __name__ == "__main__":
    main()
