# Copy links, the delete gap, and the silence — approved (option A)

## Context

He asked why the sync performance log is empty. It is NOT broken: zero copy trades have EVER been
executed (`followerTradesTotal: 0`), so there is nothing to list.

Measured in production:

    master trades recorded   22, spanning 4 Sep -> 19 Oct (30 Sep, 12 Oct, 19 Oct included)
    execution-log entries    19, ALL between 4 and 22 Sep, then silence
    follower trades, ever    0
    the only follower        follows "My signal service" (20 of the 22 trades), is_active = FALSE

So the real reason nothing copies: THE COPIER IS SWITCHED OFF. And for the three master trades
after 22 Sep the execution log says nothing at all - not even "skipped, the copier is off".

⚠ MY FIRST ANSWER WAS WRONG AND HE CAUGHT IT. I found every copy row pointing at a broker account
id that no longer exists and called that the cause. His correction: *"i deleted all accounts today
and signed them in again, So what you found happened today not the actual issue."* Correct - that
is today's artefact, not the cause.

## What to build — he chose (a)

1. **Remove the orphaned copy links** so he can set the copier up fresh against his current four
   accounts. Only rows naming a MISSING account; rows with no account at all (Telegram masters)
   are left alone. New file `server/services/copyLinkRepair.ts`, run at boot.
2. **Close the delete gap.** The main delete route cleans up its copy rows, but that cleanup is
   best-effort and it is not the only path that removes an account (`routes.ts:4856` sweeps
   abandoned sign-in placeholders with no cleanup at all). The sweep above covers both.
3. **End the silence.** `copy_platform/dispatcher.py` writes a "not copied" row per LINKED
   follower, but when NO follower is linked it only writes a stdout line - so the Activity tab is
   blank exactly when he is asking why nothing copied. `copy_execution_logs.follower_id` is
   nullable, so that case can be recorded too.

## Verification

- the sweep names what it removed and removes nothing with a NULL account
- a master trade with no linked follower leaves a row in the execution log
- the copy tests still pass, build, deploy, then re-read the diagnostics
