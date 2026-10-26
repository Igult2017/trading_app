# Fill the empty half of the journal reload skeleton's sidebar

His report, 2026-10-26, with the blank lower half of the rail ticked in a screenshot:
*"That space i have ticked should be filled in the skeleton."*

## Architecture

One file changes. No route, no table, no data flow.

| file | what it is | change |
|---|---|---|
| `client/src/components/skeletons/JournalShellSkeleton.tsx` | the placeholder shown while the journal bundle downloads | the rail's 13 nav bones take the real nav's row geometry |
| `client/src/pages/Journal.tsx` | the real page it stands in for | READ ONLY - the source of every number used |

### Why the space is empty (measured from the source, not guessed)

- placeholder today: 13 bones of 16px, 11px apart = 13x16 + 12x11 = 340, +14 top padding = **354px**
- rail height on a 768 viewport: 768 - 92 (header) = **676px**
- so the list stops at 52% of the column and the rest is bare ground

The real nav fills it because its rows are far taller:
- `Journal.tsx:133` button padding `16px 14px`; `:144` label 15.5px; `:124` wrapper marginBottom 4
- row = 16 + ~19 (the 15.5px line box) + 16 = **51px**, pitch 55
- 13 rows + `:191` nav padding `16px 12px 8px` = **727px** - fills 676 and runs past it, which is
  why the real rail is `overflowY: auto` and scrolls

## Tasks

1. Add `NAV_ROW_H = 51` and the 13 label-bar widths, each citing the `Journal.tsx` line it comes from.
2. Replace the flat 16px bones with rows of the real anatomy: a 16x16 icon bone, 14px gap, a label
   bar - inside a 51px row with 4px below it.
3. Rail padding `14px 12px` -> `16px 12px 8px` (the nav's own), and `overflow: hidden` so a short
   viewport clips like the real one scrolls instead of showing a scrollbar.
4. Build a throwaway harness, render the component, MEASURE, screenshot at 1366x768.
5. Delete the harness, typecheck, build, commit, deploy.

## What will be MEASURED to prove it worked

- the gap between the last nav bone and the bottom of the rail at 1366x768: **0** (today: ~320px)
- the line box of 15.5px Montserrat bold, to confirm the 51px row rather than infer it
- a screenshot showing the column filled top to bottom

## Assumptions

- His window is about 1366 wide (his screenshot is 1365px). On a much taller screen the placeholder
  will end where the real nav ends, leaving the same gap the real page leaves - honest, not short.
