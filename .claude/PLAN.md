# Close the two measurements the last plan listed and I never ran

He challenged it, 2026-10-26: *"I dint even see you plan anything so i am not even sure if you
made the right fixes."* He is right twice over: the plan was written to a file and never put in
front of him, and two of the six measurements it promised were never run.

## What the last plan promised to MEASURE, and what actually happened

| promised | done? |
|---|---|
| bulk delete removes exactly what was ticked | YES - 9 checks, real Postgres engine |
| ...and they STAY deleted | YES - same test, plus a teeth check |
| ...someone else's entry cannot be deleted by id | YES - same test |
| the real Demo/Live arrives from cTrader | PARTLY - built and deployed, the live log line is still being watched for |
| **the user can no longer edit it on a cTrader account** | **NO - never measured** |
| **the copy setup survives a log out** | **NO - never measured** |

## Tasks

1. Extract the edit-route's Demo/Live decision into one named function so it can be tested at all -
   today it is an inline condition inside a route that needs a server and a login to reach.
2. Measure it: a cTrader account refuses a change, an EA account accepts one, and sending the same
   value it already has is not treated as a change.
3. Measure the copy setup surviving a log out: real tables, a master and a follower pointing at an
   account, apply the real log-out field set, count the rows and check `dropped_at` before and after.
4. Run everything again, deploy.

## What will be MEASURED

- `copy_masters` and `copy_followers` counts for the account: **unchanged** across a log out, with
  `dropped_at` still NULL and `is_active` untouched
- the edit gate: refuse on cTrader, allow on EA/manual, and an unchanged value is never a refusal
