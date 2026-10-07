# Showcase screens — KEPT ON PURPOSE. Do not delete as dead code.

**His instruction, 2026-10-07: _"Keep those images in the codebase we gona use them."_**

Thirteen screens of the app, optimised and ready to use. **Nothing imports them right now**, and that
is exactly why this file exists: the standing rule in this project is that unused files get deleted,
and these would be the obvious candidate. They are not dead — they are waiting for the next place he
wants them.

## What happened, so nobody repeats it

They were built for a **crossfading background behind the hero headline** (2026-10-06, copied from the
cleaning marketplace's `HeroBackground`). He looked at it and said: *"revert the slideshow images
changes back to this which was there initially. I dont like it."* The hero went back to the original
pale-blue, dark-type, white-card look.

So: **the images are good, the hero treatment was not.** When they are used again it should be
somewhere else — a features section, a product tour, a page of its own — not behind the headline.

The component that displayed them, `client/src/components/HeroBackground.tsx`, was deleted and is in
git up to commit `fd7b5fbe`. It has the crossfade, the one-step-ahead loading and the reduced-motion
handling already solved, so it is worth reading before writing a new one.

## What these files are

| | |
|---|---|
| `slide-01..13.webp` | **2560 × 985**, about 70 KB each |
| `manifest.json` | the slide list plus the dimensions, so a component need not hardcode them |

**They ship in the build but cost a visitor nothing** — static files are only fetched when something
references them.

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
