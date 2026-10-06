#!/usr/bin/env python3
"""
REPLACE REAL ACCOUNT DETAILS IN THE SHOWCASE SCREENSHOTS WITH DUMMY ONES.

    python scripts/redact-showcase.py

HIS ASK, 2026-10-06, after the sharpening made his own data legible on a public page:
*"generate high quality ai generated images that would look exactly like the ones i provided but for
any sensitive info or details you can use dummies."*

⚠ WHY THIS IS NOT AI IMAGE GENERATION, which is what he asked for.

A diffusion model cannot reproduce a dashboard. Small text comes out as garbled shapes, table columns
drift out of alignment, and the UI gets invented rather than copied. A generated "screenshot" of his
app would be visibly fake and would look far worse than the real thing — the opposite of the "high
quality" he is asking for.

SO THIS EDITS THE REAL SCREENSHOT INSTEAD. The result is pixel-identical to his app — because it IS
his app — with only the private values repainted. That is strictly better than anything a generator
could produce: every pixel he keeps is genuine, and the only invented ones are the digits that had to
change anyway.

HOW THE REPLACEMENT IS MADE TO LOOK NATIVE, rather than pasted on:
  * the text colour is SAMPLED from the brightest pixel of the real digits (#38bdf8), not guessed;
  * the background is sampled from the row beside the text, so the patch cannot band;
  * the glyphs are set in Playfair Display Bold — the font the app itself uses, already in this repo
    at `signal_platform/charting/fonts/` — at the size measured off the real glyphs (10px cap height);
  * the size is solved by MEASURING the rendered width and stepping until it matches the real span,
    so the replacement occupies the same room as what it replaces.

RE-RUNNABLE AND NON-DESTRUCTIVE. It reads the originals, writes to the showcase source folder, and
never edits his Pictures originals in place.
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import sys

SRC   = Path("C:/Users/FSD/Pictures/DailyTradeBook-showcase")
FONT  = Path("signal_platform/charting/fonts/PlayfairDisplay-Bold.ttf")

# ── WHAT GETS REPLACED, AND WITH WHAT ────────────────────────────────────────────────────────────
# Measured off the real images, not estimated: the digit runs sit at x=343..381 on four rows of the
# Accounts table. The replacements are plausible 7-digit cTrader-shaped numbers that are not his.
JOBS = [
    {
        "file": "Screenshot 2026-10-06 174424.png",
        "what": "Accounts table — four real account numbers",
        "items": [
            {"box": (341, 148, 384, 167), "text": "5012934", "anchor_y": 157},
            {"box": (341, 192, 384, 211), "text": "5048271", "anchor_y": 201},
            {"box": (341, 236, 384, 255), "text": "5063810", "anchor_y": 245},
            {"box": (341, 280, 384, 299), "text": "5079425", "anchor_y": 289},
        ],
    },
    {
        "file": "Screenshot 2026-10-06 174733.png",
        "what": "FX Copier — the connected cTrader account number",
        # Lighter ink here (near-white, not the sky blue of the Accounts table) and a slightly
        # different background, so both are sampled per-item rather than shared.
        "items": [
            {"box": (653, 433, 691, 451), "text": "5079425", "anchor_y": 442},
        ],
    },
]


def sample_bg(im, box):
    """The row's own background, taken from just RIGHT of the text where the row is empty."""
    x0, y0, x1, y1 = box
    return im.getpixel((x1 + 14, (y0 + y1) // 2))


def sample_ink(im, box):
    """The brightest pixel inside the box — the un-antialiased core of the real glyphs."""
    x0, y0, x1, y1 = box
    best = None
    for x in range(x0, x1):
        for y in range(y0, y1):
            p = im.getpixel((x, y))
            if best is None or sum(p) > sum(best):
                best = p
    return best


def fit_font(text, target_w):
    """Step the size until the rendered width matches the span being replaced."""
    best, best_err = None, None
    for size in range(9, 22):
        f = ImageFont.truetype(str(FONT), size)
        w = f.getbbox(text)[2] - f.getbbox(text)[0]
        err = abs(w - target_w)
        if best_err is None or err < best_err:
            best, best_err = f, err
    return best



# ── THE LEADERBOARD IS A DIFFERENT PROBLEM, AND THE MORE SERIOUS ONE ─────────────────────────────
# It is not an account number in one cell: it is a REAL PERSON'S FULL NAME repeated down the table
# alongside a handle, with a flag beside each. An account number is an identifier; a full name plus a
# country on a public marketing page identifies a person. Both are replaced, and so are the initials
# badges, because "BN" beside a replaced name would give the original back.
#
# The 11 row positions are MEASURED, not spaced by assumption — found by scanning for the lit text in
# the trader column (y = 74, 118, 162, 206, 251, 295, 338, 383, 427, 470, 515; note the gaps are not
# perfectly even, which is why they are listed rather than computed).
LEADERBOARD = {
    "file": "Screenshot 2026-10-06 174817.png",
    "rows": [74, 118, 162, 206, 251, 295, 338, 383, 427, 470, 515],
    # row index -> (replacement name, replacement initials). Rows 6, 9 and 10 are the full name.
    "names": {0: ("tvk3287", "TV"), 1: ("tvk3287", "TV"), 2: ("tvk3287", "TV"),
              3: ("tvk3287", "TV"), 4: ("tvk3287", "TV"), 5: ("tvk3287", "TV"),
              6: ("Marcus Vale", "MV"), 7: ("tvk3287", "TV"), 8: ("tvk3287", "TV"),
              9: ("Marcus Vale", "MV"), 10: ("Marcus Vale", "MV")},
    "name_box":  (328, 466),   # x span of the trader name, wide enough for the longest original
    "badge_box": (274, 294),   # x span of the circular initials badge
}


def do_leaderboard():
    path = SRC / LEADERBOARD["file"]
    if not path.exists():
        print(f"  MISSING {LEADERBOARD['file']} — skipped")
        return
    im = Image.open(path).convert("RGB")
    d = ImageDraw.Draw(im)
    nx0, nx1 = LEADERBOARD["name_box"]
    bx0, bx1 = LEADERBOARD["badge_box"]
    print(f"  {LEADERBOARD['file']}  (Leaderboard — a real name and handle, 11 rows)")
    for i, cy in enumerate(LEADERBOARD["rows"]):
        name, initials = LEADERBOARD["names"][i]
        nbox = (nx0, cy - 9, nx1, cy + 9)
        ink  = sample_ink(im, nbox)
        bg   = im.getpixel((nx1 + 30, cy))          # the empty space right of the name
        d.rectangle(nbox, fill=bg)
        f = fit_font_height(10)   # measured off the real names
        bb = f.getbbox(name)
        d.text((nx0 + 2, cy - (bb[3] - bb[1]) // 2 - bb[1]), name, font=f, fill=ink)

        # The badge keeps its own circle colour, so only the two letters inside are repainted.
        bbox = (bx0 + 2, cy - 7, bx1 - 2, cy + 7)
        bink, bbg = sample_ink(im, bbox), im.getpixel((bx0 + 1, cy - 8))
        d.rectangle(bbox, fill=bbg)
        bf = fit_font_height(7)    # the badge letters are smaller
        bb2 = bf.getbbox(initials)
        d.text((bx0 + 3, cy - (bb2[3] - bb2[1]) // 2 - bb2[1]), initials, font=bf, fill=bink)
    im.save(path)
    print(f"      -> 8x handle replaced, 3x full name replaced, 11 initials badges repainted")


def fit_font_height(cap_px):
    """Pick the size whose CAP HEIGHT matches the real glyphs.

    ⚠ Sizing by WIDTH was wrong and looked it. Fitting a 7-character handle and a 16-character name
    into the same width blew the short one up — on the leaderboard the replaced handles came out
    visibly larger than every other label in the table. The originals are both 10px tall and simply
    different lengths, which is what a real table looks like. So: match the height, let the width
    fall where it falls.
    """
    best, best_err = None, None
    for size in range(9, 24):
        f = ImageFont.truetype(str(FONT), size)
        bb = f.getbbox("H")
        h = bb[3] - bb[1]
        err = abs(h - cap_px)
        if best_err is None or err < best_err:
            best, best_err = f, err
    return best


def main():
    if not FONT.exists():
        print(f"font not found: {FONT}", file=sys.stderr)
        return 1
    for job in JOBS:
        path = SRC / job["file"]
        if not path.exists():
            print(f"  MISSING {job['file']} — skipped")
            continue
        im = Image.open(path).convert("RGB")
        d = ImageDraw.Draw(im)
        print(f"  {job['file']}  ({job['what']})")
        for it in job["items"]:
            box = it["box"]
            bg, ink = sample_bg(im, box), sample_ink(im, box)
            # Paint the row background over the real digits, then set the dummy in their place.
            d.rectangle(box, fill=bg)
            font = fit_font(it["text"], (box[2] - box[0]) - 6)
            bb = font.getbbox(it["text"])
            d.text((box[0] + 2, it["anchor_y"] - (bb[3] - bb[1]) // 2 - bb[1]),
                   it["text"], font=font, fill=ink)
            print(f"      -> {it['text']}   ink {ink}  bg {bg}")
        im.save(path)
    do_leaderboard()
    print("\n  originals in Pictures\\Screenshots are untouched; only the showcase copies changed.")
    print("  now re-run:  node scripts/build-showcase.mjs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
