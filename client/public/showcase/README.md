# Showcase screens — IN USE on the landing page.

Thirteen screens of the app, optimised for the web. **They are the landing page's slideshow**, read by
`client/src/components/HomeShowcase.tsx`, which sits directly under the hero.

⚠ **`HomeShowcase.tsx` holds its own list of the 13 files with a caption for each. Adding or removing
a screen means editing BOTH** — re-run the build script below, then add the line there. `manifest.json`
is written by the build script and is not what the component reads.

## What happened, so nobody repeats it

They were first built for a **crossfading background behind the hero headline** (2026-10-06, copied
from the cleaning marketplace's `HeroBackground`). He looked at it and said: *"revert the slideshow
images changes back to this which was there initially. I dont like it."* The hero went back to the
original pale-blue, dark-type, white-card look, and the images sat unused for a day.

**The images were never the problem — the hero treatment was.** He kept them on purpose (*"Keep those
images in the codebase we gona use them"*), and on 2026-10-07 picked the placement himself from a
reference design: a framed panel BELOW the headline rather than wallpaper behind it. That is
`HomeShowcase`.

The old component, `client/src/components/HeroBackground.tsx`, was deleted and is in git up to commit
`fd7b5fbe`. Do not revive it — it is the treatment he rejected.

## What these files are

| | |
|---|---|
| `slide-01..13.webp` | **2560 × 985**, about 70 KB each, 918 KB for the set |
| `manifest.json` | written by the build script as a record of what it produced. **`HomeShowcase.tsx` does NOT read it** — it keeps its own list, because each slide also needs a caption naming the screen |

**A visitor pays for two of the thirteen, not all of them — measured, 125 KB.** `HomeShowcase` withholds
each image's `src` until that slide is reached, keeping only the current one and the next one loaded.

⚠ **`loading="lazy"` DOES NOT WORK HERE and was tried.** Measured on 2026-10-06: all 13 were fetched
anyway (337 KB at the then-smaller sizes), because every slide lives inside the carousel's track and
so counts as "in the viewport". Withholding `src` is the only thing that works. Do not "simplify" it
back to the attribute.

## Two things that were hard-won. Do not undo them.

**1. They are UPSCALED on purpose, and the size is not arbitrary.** His captures were 1365 × 525. In
the hero that meant the browser *enlarged* them 1.25×, which is what made them look blurred — measured
in the browser, not guessed. `build-showcase.mjs` now resamples to 2560 wide with Lanczos plus an
unsharp mask, so the browser *downscales* instead, which is always sharp. 2560 keeps them sharp up to
a 1.5× screen (nearly every Windows laptop) and costs 37 KB less per image than full 2×.

**2. The private details in them are DUMMIES, and must stay that way.** The originals showed four real
cTrader account numbers, a connected-account number on the copier screen, and — worst — a real
person's full name eleven times on the leaderboard beside a country flag. `redact-showcase.py` repaints
all of it, sampling the real ink and background colours and setting the replacements in the app's own
Playfair Display so they look native.

⚠ **If new screenshots are added, run the redaction before the build**, and check what is legible.
Sharpening these made his own data readable; blur had been hiding it.

## Regenerating

```
python scripts/redact-showcase.py      # replace private details with dummies
node   scripts/build-showcase.mjs      # resize, sharpen, convert to WebP, write the manifest
```

Source screenshots live in **`C:\Users\FSD\Pictures\DailyTradeBook-showcase`** — a dedicated folder,
**not** `Pictures\Screenshots`. That matters: the script used to read the Windows screenshots dump, and
on its second run it silently published four pictures of a chat into the slideshow. Any screenshot he
ever took would have gone to the public site at the next build.
