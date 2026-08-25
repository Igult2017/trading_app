# OPEN — everything we have NOT addressed

**His instruction, 2026-08-25:** *"consolidate the issues we havent address so that we can address
them one at a time — a problem comes up we know where to look at."*

**This is the ONE list.** Before this, open items were spread across `open-items.md` (409 lines,
fixed and open items mixed together), the KNOWN OPEN DEFECTS section of the BX architecture doc
(where the id scheme had collapsed — `0u`, `0v`, `0y` and `0z` each appeared **twice**, meaning two
different defects), the VIX.1 docs, and a dozen memory notes.

## How to use it

- **Ids never change and are never reused.** When something is fixed, strike it and date it here —
  do not delete the row and do not renumber.
- **Every row says WHERE to look.** That is the whole point: a problem comes up, you open this file,
  you know which file to read.
- **"Verified" means I checked it today.** "Carried" means it comes from an older doc and I have
  **not** re-checked it — treat those as claims, not facts, and verify before acting.
- Nothing here is urgent unless marked 🔴. Production is running.

---

## A. Supply & demand zones (BX-S/D)

### A1 — The two Telegram cards can't actually collide. ⚠ I OVERSTATED THIS — corrected 25 Aug
**Not a live defect.** I first wrote this as 🔴 *"one tap can fire both the stand-aside card and a
real entry"*, having checked that the `role` divider was gone from both sides but **never checking
whether anything else kept them apart.** Something does.

**The chain, all four links read and then tested:**

| step | file:line | what it establishes |
|---|---|---|
| 1 | [`bx_sd_registry.py:401`](../signal_platform/strategies/bx_sd_registry.py#L401) | a zone is only labelled `decisional` if `respected_at` is set |
| 2 | [`bx_sd_registry.py:554`](../signal_platform/strategies/bx_sd_registry.py#L554) | `respected_at` is only ever stamped together with `state = "respected"` |
| 3 | [`bx_sd_registry.py:575`](../signal_platform/strategies/bx_sd_registry.py#L575) | once respected, always respected — it only leaves that state by breaking |
| 4 | [`bx_sd_setup.py:309`](../signal_platform/strategies/bx_sd_setup.py#L309) | the entry path's FIRST gate takes only `unmitigated` or wick-only zones |

So **decisional ⟹ respected ⟹ the entry path skips it at its first line.** Tested on both live
books: **0 zones satisfy both paths**, and every `decisional` zone is in state `respected`.

**What IS real, and why this row stays open:** the guarantee is **accidental**. It rests on two
unrelated rules happening to line up, and the comment that documented the *intended* divider was
false for six days — so the next session reading `bx_sd_reports.py` was told the wrong mechanism.
Either of these would re-open the collision without anything failing loudly:
* labelling a zone `decisional` before it has been respected, or
* letting the entry path take a `respected` zone.

**Fix when convenient:** a test asserting no zone can satisfy both paths, so the guarantee stops
being a coincidence and starts being enforced. **Low priority — nothing is broken today.**

### A2 — What happens when the 4H is going sideways is MY decision, not his
**Verified 25 Aug.** His definition of an extreme zone covers price swinging **up** and **down**.
When the market is going sideways there is no "above it" to point at, so I coded it as: **no new
extreme candidate opens** while ranging (a zone already respected keeps its status).
**Where:** `signal_platform/strategies/bx_sd_extreme.py`, `extreme_candidate_at`.
**Why open:** he never ruled on it, and **how often the 4H reads sideways has not been measured.**
**Needs from him:** a ruling — or approval to measure it first.

### A3 — Signal 1 will fire less often now, and by how much is unmeasured
**Verified 25 Aug.** Signal 1 gained two tests it never had: the zone must stand against the swing,
and price must have swept liquidity to reach it. Both will cut how often it fires. The one-year
baseline is 4.9 signal 1 / 0.6 advisory / 7.3 signal 2 per month
([bx-sd-measured.md](./strategies/bx-sd-measured.md)).
**Why open:** measuring it is a **frequency backtest**, and backtests need his explicit approval
every time. Plan approval is not backtest approval.
**Needs from him:** "run it".

### A4 — `test_aug03_regression.py` is red, and two of its assertions pin something I invented
**Verified 25 Aug** (confirmed red *before* any of this week's work, by stashing). 3 of 6 assertions
fail. Two assert a "16 Jul zone he drew" — **no such zone exists**; I traced it to a test label I
wrote on 3 Aug and then repeated into three doc places.
**Where:** `signal_platform/tests/bx_sd/test_aug03_regression.py`.
**Why open:** a test that pins a fabricated fact is worse than a red test, because the next session
will bend the *code* to satisfy it. I will not quietly delete his regression test either.
**Needs from him:** delete those assertions, or keep the file red.

### A5 — In 3 of 19 turns, the reaction leaves no zone behind for signal 2 to enter
**Carried** from 23 Aug, plan written and deliberately closed unbuilt. His rule is already recorded:
*"where there is no zone left behind by the reaction…"* — see the BX architecture doc.
**Where:** `signal_platform/strategies/bx_sd_lineage.py` (`child_of`).
**Why open:** it is a feature, not a bug fix, and he has not asked for it.
**Note:** originally reported by me as **5** events; the real number is **3**.

### A6 — The Smart Risk document's own definition of a change of character is not built
**Carried.** The document defines it as a close through the major swing **and** the latest opposite
zone. The engine BX uses to *build* zones is the same one that would have to answer this, so making
it zone-aware is circular.
**Why open:** blocked on a design decision, flagged rather than guessed.

### A7 — Nine BX files are over the 200-line limit
**Verified 25 Aug.** `bx_sd_registry` 586, `bx_sd_setup` 577, `bx_sd_signal1` 340, `bx_sd_zones` 336,
`bx_sd_lineage` 312, `bx_sd_liquidity` 277, `bx_sd_reports` 268, `bx_sd` 267, `bx_sd_entry` 234.
**Correction:** the old doc said *"four BX files over the 150-line limit"* — both numbers were stale.
**Why open:** splitting files that are actively being changed invites regressions; do it when an area
goes quiet.

---

## B. VIX.1

### B1 — The trend flips about 90 times a year, not the 9–10 its own note claims
**Carried** from 15 Aug. Median run 1.6 days. Not a coding error — a consequence of reading the trend
in real time with no "major swing" filter. The table in the doc is stale: it was measured the day
*before* real-time turns shipped.
**Where:** see [strategies/vix1.md](./strategies/vix1.md).

### B2 — The 1-minute entry is mid-rebuild
**Carried.** Do not design it and do not patch the old one — his rules are pending. The audit is in
the VIX.1 docs, including: the stop-level search blocks every entry for ~8 minutes after a momentum
candle, and the fall-back path is unreachable.

---

## C. The web app

### C1 — 18 TypeScript errors, and the build does not typecheck
**Verified 25 Aug** — still exactly 18, and `npm run build` still has **no** `tsc --noEmit` step, so
type errors can ship. Two real runtime bugs already hid in this noise once.
**Fix:** raise the compiler `target` to `es2015`+ (clears about 11 of them), fix the rest, then add
the typecheck to the build so it can never happen again.
**Why open:** nobody has asked for it. It is the highest-value cleanup on this list.

### C2 — The journal sidebar shows made-up numbers
**Carried.** The data source is decided (`/api/metrics/compute`); 7 of 10 fields map, and
`bestTrade`, `worstTrade` and `totalFees` must be added server-side first.

### C3 — Past journal entries may have profit/loss recorded wrong
**Carried, needs his data.** Cannot be confirmed without him identifying an affected trade.

### C4 — The legal pages need a rewrite
**Carried.** The governing-law clause names no law, and there is no risk / not-advice disclaimer
anywhere. Blocked on one question: does copy trading auto-execute on a user's account?

---

## D. cTrader & copy trading

### D1 — Production routes new account connections through a BLOCKED app
**Carried.** The fix is to unset two `CTRADER_SYNC_*` environment variables and redeploy.
**Blocked on:** the Spotware reply.
**Where:** [ctrader-open-api-apps.md](./ctrader-open-api-apps.md).

### D2 — An orphaned copy master logs "broker account not found" every 30 seconds
**Carried** from 30 Jun. Needs cleaning up or auto-deactivating.

---

## E. Parked — do not start these

| | | |
|---|---|---|
| **E1** | Landing page redesign | parked 7 Aug until he asks. Zip and tokens kept |
| **E2** | Correlated-pair study (`fx_smt_lab`) | paused. The lead-lag idea was **rejected** by measurement; the "candle at a zone" finding is the part worth keeping |
| **E3** | Logo artwork | his supplied image is used as-is. Dark variant still undecided |

---

## CLOSED — kept so they are not re-opened by mistake

| id | what | closed |
|---|---|---|
| ~~A0~~ | Tap was one-sided — a bar far below a demand zone counted as touching it. Three copies, all fixed. Measured impact under 1%, zero lifecycles changed | 25 Aug |
| ~~A0b~~ | `decisional` assigned by position | 25 Aug — replaced by the creation test |
| ~~A0c~~ | Zones marked off a structure break that pre-dated them | 25 Aug |
| ~~A0d~~ | Telegram signals carried no chart | 3 Aug |
| ~~A0e~~ | 1-hour candles cached for 48 minutes | 20–21 Aug |
| ~~A0f~~ | Light theme unverified | 1 Aug — seen, it is fine |
| ~~A0g~~ | 11 orphaned files | deleted 1 Aug |

---

## The three mistakes of mine that this list exists to stop

1. **Reporting one copy of a bug as the whole bug.** The tap fix was three places, not one.
4. **Calling something broken after checking only the mechanism I expected.** A1 was filed 🔴
   because the divider I looked for was gone — I never asked whether anything ELSE kept the two cards
   apart. Something did, and the answer was four lines away in a file I had already read.
2. **Asserting a number I had not measured.** Two claims about the tap bug — the log line it
   supposedly caused, and a "70% false" rate — were both wrong and both had to be retracted.
3. **Inventing evidence.** A "zone he sent on 16 Jul" never existed and reached three documents
   before he caught it (A4).
