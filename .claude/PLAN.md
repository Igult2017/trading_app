# Dark theme: the placeholder hints are invisible — fix them too

## Why this is now in scope

The approved plan said "not touching the dark theme, beyond reporting the 1.18:1 placeholder".
He overrode that: *"Fix that dark theme invicibility you ignored too"*. So the exclusion is gone
and the same defect gets the same treatment in the dark themes.

## The defect, measured

    dark placeholder   #3f3f46 at 35% opacity over #0c0c0e  ->  rgb(30,30,34)   1.18:1   invisible
    (for comparison)   label #a6b3d1 9.30:1 | typed value #e8edf9 16.67:1

Two rules meet: the Tailwind class on each input sets the colour (placeholder:text-[#3f3f46], a
near-black meant to be a hint on a dark ground), and OBS_CSS then multiplies the whole thing by an
0.35 opacity. 35% of a near-black on a near-black is nothing.

## The change

| file | change |
|---|---|
| `client/src/components/journal-form/jfReadable.ts` | add ONE rule: dark-theme placeholders become `#757E9C` at full opacity |
| `client/src/components/JournalForm.tsx` | DELETE the now-dead `opacity: 0.35` placeholder line from `OBS_CSS` |

`#757E9C` measures **4.86:1** on the input ground `#0c0c0e` and **4.95:1** on the page `#09090b`.
It sits deliberately between the label (9.30:1) and nothing, so a hint still reads as a hint and
not as a value already typed.

The 0.35 line becomes dead once both themes set opacity explicitly — `.obs-jf` only ever renders
inside `.journal-root` (mounted once, `Journal.tsx:1442`, root class at `Journal.tsx:1425`), so
every placeholder is inside either `.journal-light` or `:not(.journal-light)`. Dead CSS gets
deleted, not left to look live.

## Verification

1. Browser probe on the dark copy: placeholder contrast must be >= 4.5:1 (it is 1.18 now).
2. Light copy must be UNCHANGED at 4.71:1 — this must not disturb what already shipped.
3. `scripts/check-readability.mjs` still 0 and 0 on both copies.
4. Look at both screenshots.
5. tsc, build, deploy, delete the harness files.
