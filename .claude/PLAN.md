# The first frame on reload still draws the OLD skeleton

His report: *"there are remnants of that hanging skeleton we were removing and it appears shortly
before the fix you made of a full skeleton takes over."*

## The cause

TWO copies of the journal skeleton exist; I fixed one.

| copy | where | when |
|---|---|---|
| hand-written HTML | `client/index.html:186` (`#boot-journal`) | the FIRST frame, before any JavaScript |
| React component | `client/src/components/skeletons/JournalShellSkeleton.tsx` | once React mounts |

The HTML copy still had the short rail (`height: 16px` rows, `gap: 11px`), no edge line, fixed
302px panels and an uneven bottom gutter.

## Tasks

1. Rail: 16/12/8 padding, no gap, clip, the page's own edge line. DONE
2. Rows: 51px, 4px apart, 16px icon bone + label bar at the measured widths. DONE
3. `.bj-main` bottom padding 16. DONE
4. `.bj-split` stretches; panels take a MINIMUM height, not a fixed one. DONE
5. Light-theme overrides follow the new elements. DONE
6. `box-sizing: border-box` on the boot block - it paints before Tailwind's reset, so its rail
   measured 210px against the React one's 185px and jumped at the swap. IN PROGRESS
7. Measure the first frame with React blocked, then compare the two side by side.

## What will be MEASURED

- first-paint rail reaches the bottom (gap 0) and panels sit on the 16px gutter
- rail width, row height and header height IDENTICAL to the React placeholder, so the swap is
  invisible rather than a jump
