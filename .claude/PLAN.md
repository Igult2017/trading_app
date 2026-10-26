# Correct the sweep interval in the comments I wrote today

Not a behaviour change. Five comment lines carry a wrong number.

## The fact
`server/services/autoSyncService.ts:51` — `SYNC_INTERVAL_MS = envInt('SYNC_INTERVAL_MINUTES',
24 * 60, 5, 7 * 24 * 60) * 60_000`. The default is **1440 minutes = once a day**, and production
does NOT set `SYNC_INTERVAL_MINUTES` (59 env keys, no SYNC_INTERVAL* among them). So the sweep is
DAILY, not every 15 minutes. `:67` says so itself — "every 4th day on the daily timer".

Trades still record instantly: the live feed (`ctraderRealtime`) writes on close, and
`missedCloseWatch` runs as a backstop. The daily sweep is the deep backstop, and it is where the
Demo/Live refresh sits.

## Tasks
1. Fix the five comment lines that say "15-minute" / "every 15 minutes".
2. Say it to him, because it changes how often his Demo/Live status refreshes.

## Measured
`grep -rn "15-minute\|every 15" ` over the files I wrote returns nothing.
