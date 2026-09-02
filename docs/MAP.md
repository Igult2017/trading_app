# THE MAP — start here, every session

**Why this file exists.** His instruction, 2026-08-25: *"everytime i ask you a question about this
code we start from scratch which introduces bugs along the way. Keep its map and progress."*

Starting from scratch is not a style problem, it is how defects get reintroduced. Three times in one
week a rule was re-derived from the code instead of read from the doc, and each time it came back
wrong. **Read this file first. Then read the ONE doc it points you at. Do not go straight to the
code.**

Two companions, and only two:

| file | what it holds |
|---|---|
| **[OPEN.md](./OPEN.md)** | every issue we have NOT addressed — one numbered list, one at a time |
| this file | where everything lives, what state it is in, and what has been SETTLED |

---

## The system in one picture

Two things ship as **one deployment** — the Python signal engine lives inside the journal web app,
and there is no way to deploy one without the other.

| part | what it does | lives in |
|---|---|---|
| **Journal web app** | trade log, analytics, blog, copy trading | `client/` (React) + `server/` (Express) |
| **Signal engine** | scans the market, sends Telegram cards | `signal_platform/` (Python) |
| **Shared DB schema** | table definitions both sides read | `shared/schema.ts` |

Deploys are **manual and explicit** — Coolify does not deploy on push. Nothing ships unless he says
so.

---

## Where to look, by question

### "Why did BX send me this signal?" / anything about supply & demand zones

**Read [strategies/bx-sd-architecture.md](./strategies/bx-sd-architecture.md) FIRST** — it holds the
shape: the module map, the zone-book model, the lifecycle, and the known open defects.
Then [strategies/bx-sd.md](./strategies/bx-sd.md) for the settled rules in his own words and the fix
log. [strategies/bx-sd-measured.md](./strategies/bx-sd-measured.md) holds every number that has
actually been measured — read it before quoting any figure about how often BX fires.

The chain a signal travels, so you know which file to open:

```
bx_sd_zones      what shape counts as a zone (the imbalance, the marking)
bx_sd_registry   marks it ONCE when it qualifies, then ages it: pending -> unmitigated
                 -> wick/body mitigated -> respected -> broken
bx_sd_extreme    is this an EXTREME zone? (candidate + respected)
bx_sd_signal1    SIGNAL 1 — the pullback after the extreme reacted, before the turn completes
bx_sd_lineage    parent/child, and whether the turn was real or fake
bx_sd_setup      SIGNAL 2 — the return to the zone the turn created
bx_sd_entry      where the entry, stop and target actually sit
bx_sd_reports    the heads-up and stand-aside cards
```

### "Why did VIX.1 do that?"

**Read [strategies/vix1-architecture.md](./strategies/vix1-architecture.md) first**, then
[strategies/vix1.md](./strategies/vix1.md) for the settled rules and the fix log.

### "Where should this file live?" / anything about reorganising the codebase

**[docs/RESTRUCTURE.md](RESTRUCTURE.md)** — the agreed target structure, written 2026-08-29 and NOT
yet done. It holds the measured state (700 files, ~129,600 lines, 111 folders, 139 files over the
200-line limit), the **five platforms** the product actually is, a **file-by-file mapping** for all
four crowded folders, the phase order with effort and risk, and the two open questions that block
specific phases.

**Read it before moving anything.** It exists so the next session does not re-derive the plan — his
instruction: *"when I tell you we need to do it, you don't start from scratch and you already know
where everything is and where it is supposed to go."*

### "This page looks blurred / the text is hard to read"

**[docs/READABILITY.md](READABILITY.md)** — the recipe, after five surfaces were fixed the same week
with the same cause. **Run the tool before reading any code:**

```bash
npm run build && node scripts/check-readability.mjs "" blog calendar about
```

**The headline lesson: it is almost never the colour.** The economic calendar's greys already passed
at 7.58:1 — the blur was a display serif at 8–10px in a dense table. The landing page had a constant
literally named `sans` that was Playfair Display.

### "Why does the Drawdown page say that?"

A **panel inside Journal**, not its own route — sidebar item `drawdown`, rendered at
`client/src/pages/Journal.tsx:1516`.

| layer | where |
|---|---|
| the panel | `client/src/components/DrawdownPanel.tsx` (527 lines), `components/drawdown/diveProfile.tsx` (the underwater chart), `components/drawdown/dpStyles.ts` |
| the route | `server/routes.ts:1723` — `/api/drawdown/compute`, cached 5 min per user+session, dropped when the trade count changes |
| the maths | `server/services/drawdownCalculator.ts` spawns `server/python/drawdown/main.py` -> `core.py` -> 13 modules |

It runs on your **journal trade entries**; it has nothing to do with the signal platform.

**Two things that will bite you if you do not know them:**

* **The equity curve has ONE definition — `_utils.equity_curve`** (2026-08-29). It used to be written
  out five times and the copies drifted, which put two different "maximum drawdown" figures on the
  same page. `distribution.py` keeps its own month-relative walk on purpose (a different quantity,
  documented there). `test_consistency.py` fails if a sixth copy appears.
* **The database returns entries NEWEST-FIRST** (`storage.getJournalEntries`, `orderBy(desc(createdAt))`).
  A drawdown is a property of the sequence, so anything walking that list raw reads the account
  backwards. `equity_curve` sorts internally so a caller cannot forget.

### "Why is the site slow / the logo late / the theme wrong?"

[performance-audit.md](./performance-audit.md), then the client files. Caching lives in
`server/static.ts`.

### "Why didn't the platform tell me it was down?"

[signal-platform-observability.md](./signal-platform-observability.md).

### "Copy trading"

[copy-platform.md](./copy-platform.md) and [copy-trading-setup.md](./copy-trading-setup.md).

### "cTrader connection / tokens / the blocked app"

[ctrader-open-api-apps.md](./ctrader-open-api-apps.md).

### "will this hold at 2000 users?" / "account sync is eating the signal platform's connections"

[ctrader-scaling.md](./ctrader-scaling.md) — **Spotware REFUSED the second app (31 Aug 2026)**, so one
approved application carries the scanner, account syncing and copy trading permanently. The doc holds
the measured facts, what breaks at 15 / 200 / 2000 users, and four staged changes each gated on a
measurement. **The rule it exists to protect: connection count must not grow with user count, and the
signal platform is never behind a Node queue.**

---

## SETTLED — do not re-derive these

Each of these cost a round trip or a defect to establish. **If a change contradicts one, the change
is wrong.** Full wording lives in the linked doc; this is the index so you know a ruling exists.

### Supply & demand zones (BX-S/D)

| settled | when | where the full rule lives |
|---|---|---|
| A zone must break a level that **already existed** before it formed — and the break may land on the impulse candle itself | 25 Aug | bx-sd-architecture, "Formation" |
| **Zones are not measured.** No size, distance or "how far it travelled" test. A rule of mine was added and deleted the same day for exactly this | 25 Aug | bx-sd-architecture, "Formation" |
| An **extreme zone** = an untouched zone standing against the swing, in front of price, reached by sweeping liquidity — **that price then respected** | 25 Aug | bx-sd-architecture, "THE EXTREME ZONE" |
| **No bound on how far out** an extreme candidate may sit. Three bounds were proposed, all three rejected | 25 Aug | same |
| **Decisional** = the zone's own reaction produced a **fake** turn. Never "a neighbour won" | 25 Aug | bx-sd-architecture, "DECISIONAL" |
| A **tap** means the bar and the band **overlap** | 25 Aug | bx-sd.md fix log, 25 Aug (c) |
| Signal 1 and signal 2 share **one** extreme zone; the only difference is whether the opposite zone has broken yet | 23 Aug | bx-sd-architecture |
| Respect = **3 closed candles** clear of the zone, not a distance | 23 Aug | bx-sd-architecture |
| D/W/M zones are **confluence, never a gate** | 01 Aug | bx-sd.md |
| **Never backtest without asking** — plan approval is not backtest approval | 27 Jul | CLAUDE.md |

### Platform-wide

| settled | why |
|---|---|
| **Never deploy** unless he explicitly says to | Coolify does not auto-deploy; shipping is his call |
| **A level comes from a CLOSED candle; a trigger or current price stays LIVE** | the feed returns the still-forming bar as its newest — both strategies shipped a bug from reading it as a level |
| **Signals display on the existing `AssetPage.tsx`** — never a new dashboard | |
| **Dead files are DELETED**, not left | orphaned files are unwatched attack surface |
| **The strategy doc is updated in the same change as the code** | the code drifted from the docs repeatedly, and the next session then guessed |
| **Strategies are independent** — never describe one by comparing it to another | comparison is how one strategy's rules leak into another |
| **The container runs `server/index.prod.ts`, NOT `server/index.ts`** — and the split must stay | `start.sh:69` runs `dist/index.prod.js`. `index.ts` reaches Vite through a RELATIVE `await import("./vite")`, so esbuild bundles it and ESM hoists `vite` + its plugins to the top of `dist/index.js`; those are devDependencies and the image installs `--omit=dev`, so running `index.js` in the container dies at startup |
| **A fault reading a message must never kill the connection carrying it** | `fix_book.absorb` had this right — *"A bar builder must never be able to kill the price stream that feeds it"* — and the copy provider's `_on_message` had no guard at all, so a one-word typo dropped the broker connection **56 times in 7 hours** (**D28**). The transport outlives a fault in anything reading from it. The same rule downward: a failure to read ONE position must never be reported as that position CLOSING |
| **"Never arrived" and "went quiet" are different states, and a check that conflates them cries wolf** | `age()` returns None for both; `is_stale` returned True for both, so the price stream was called dead **one millisecond after it opened** (**D27**). Anything judging silence must know WHEN it started listening — record the connect time, not just a connected flag |
| **A contract size, a volume limit and a price precision are READ FROM THE BROKER, never assumed** | the symbol list both platforms fetch is `ProtoOALightSymbol`, which carries **none of them** — only id, name, enabled, asset ids, category, description (verified on the live account, 02 Sep). `execution/connection.load_symbol_spec` asks for the full `ProtoOASymbol`. Assuming a currency lot's 100,000 units sent a gold order **1,000× too large** and the broker refused it (**B17**), and a gold price at three decimals on a two-decimal symbol was refused the day before |
| **Every journal page is built from ONE list, and anything that writes to it must clear the cache** | `resolveComputeScope` (routes.ts) reads `journal_entries` once and the calendar, drawdown, metrics, timeframe-matrix and strategy-audit engines all consume it — so a new entry reaches every page automatically, but only if `invalidateComputeCaches` (**`lib/cache.ts`, not routes.ts**) is called. It was local to routes.ts, so only typed trades cleared it and synced ones stayed invisible for 5 minutes (**D23**) |
| **A pip comes from the instrument's precision, never from how big its price is** | `price > 100 ? 100 : 10000` is right for the four currency pairs by luck and 10× wrong for gold. The table lives in **two places that must change together** — `signal_platform/shared/pip.py` and `server/lib/pipMath.ts` — because Node cannot import Python. Gold is **2 decimals**, which the broker established by refusing a 3-decimal price |
| **Every enum from the cTrader JSON gateway arrives BY NAME, not as its integer** | `dealStatus: "FILLED"`, not `2`; `tradeSide: "BUY"`, not `1`. One `!== 2` test meant **no cTrader trade ever reached the journal** (**D22**). Match on the name and the integer both, never the integer alone |
| **Anything both entries need goes in `server/lib/appSetup.ts` (middleware) or `server/lib/backgroundServices.ts` (services)** — never added to an entry file | keeping the two entries in step by hand failed twice, silently, for months: helmet + both rate limiters (so production had **no brute-force limit on login**) and both trade recorders (so production **recorded no broker trades at all**). `server/lib/entryParity.test.ts` fails if it starts again |

---

## PROGRESS — what actually happened, newest first

**2026-09-02 (b) — he asked why the FIX system cries wolf on every deploy. The logs answered that
and found something worse.**

*The false alarm (**D27**).* The price stream was declared dead **one millisecond after it opened** —
03:56:11.853 stream open, 03:56:11.854 "price stream quiet", DM sent, recovered 769 ms later. The
cause is one line: `age()` returns None both for *"no tick has ever arrived"* and *"the stream
stopped"* — its own docstring says they are different problems — and `is_stale` read
`a is None or a > limit_s`, collapsing them. The book knew THAT it was connected, never WHEN. It now
stamps the clock on connect and measures the silence from there, judged by the same 90-second limit,
so a subscription that logs on and never delivers is **still caught, just timed honestly**. It was
never only about deploys either: the same alarm fired mid-session every time a new position opened
its own stream. And the all-clear now goes out — recovery used to only write a log line, leaving him
holding a warning about a feed that had already come back.

*93% of the remaining noise was one known finding, repeated.* 405 of 434 mismatch warnings were
GBP/JPY saying the same thing every bar. Now classified: a clean constant offset is said once and
again if it changes; a real candle fault still logs every time. Trust is untouched.

*And the logs turned up a live defect that had nothing to do with FIX (**D28**).* The copy engine's
broker connection was **dropping and reconnecting 56 times in 7 hours** — one every seven minutes —
because `_want_spec` said `self._client` where the attribute is `self.client`. The typo is the
trigger; **the cause is that `_on_message` had no guard at all**, so an exception escaped into
Twisted, which reads it as a failed connection. The rule was already written down in
`fix_book.absorb` — *"A bar builder must never be able to kill the price stream that feeds it"* —
and was simply absent here. Fixing it exposed a worse one: a failure to READ a master's position
made the reconcile report it as CLOSED, which would have closed the follower's real position.

**2026-09-02 — two defects on the cTrader boundary, and both were one assumption each.**

*The order the broker refused (**B17**).* Sizing held one constant, `LOT_UNITS = 100_000`, and used
it for every instrument. That is a **currency** lot; **a gold lot is 100 ounces**, so a 0.13-lot
XAU/USD order went out as 13,000 ounces instead of 13 and cTrader refused it. Nothing could have
caught it: the symbol list the order path fetches carries no contract size at all. It now asks the
broker for the real `lotSize` and the real volume limits, and refuses — in words, to his DM —
anything outside them **before** the request leaves.

*No cTrader trade ever reached the journal (**D22**).* One line rejected every real deal:
`dealStatus !== 2` when the gateway sends `"FILLED"`, and a required `closePositionDetail` that
**0 of 30 real deals carried**. Both routes into the journal ran through it, both returned nothing,
and both did so silently because a null there means "an opening fill, ignore it". A closed position
is now recognised from what IS present — its deals paired, or the position the live event already
carried and was throwing away. Three more defects sat behind it, including one that would have kept
every live-recorded trade OUT of the journal even after the mapping was fixed.

**Proved against real broker data**, not fixtures I wrote: six deals captured verbatim from the live
demo account, including his own autotraded EUR/USD trade — the one that existed at the broker and
was absent from his journal.

*Then the journal audit he asked for (**D23**), and six more gaps.* Getting a trade INTO the journal
turned out to be only half of it. Every page reads one list, so a synced trade reached all of them —
carrying blanks a typed trade would not have. The cached pages were never cleared (so it was
invisible for five minutes anyway); there was no account balance, no monetary risk, no risk percent;
a trade could never be recorded BREAKEVEN even though the ladder now moves the stop there at 0.4R;
pips were guessed from the price and so were **ten times too many for gold**; and the stop and
target the broker sends were thrown away, leaving every synced trade with no risk/reward and no
achieved R. All six fixed. Two things stay blank because a broker genuinely cannot know them —
the timeframes and the best/worst price reached — and for autotrade the first of those IS knowable,
carried forward as **D24**.

*And the gold fix re-checked against the cTrader skill*, at his request. Its precision table, its own
converter (0 disagreements across 2,500 sizes) and its quirk Q-L1 all confirm the fix. The skill also
exposed the deeper fault: the fallback silently treated **any** unrecognised instrument as a currency
pair, so an index would have been 100,000× out. It now says "I don't know" and the order is refused.

**2026-08-29 (b) — Drawdown page, his four presentation asks.** The font now **inherits** from the
journal (it fell back to a hardcoded Playfair, and `.dp` is exempt from the journal's global font
rule, so the page kept a face the journal had moved off). The banner heading is gone — it reads
"Tracking Drawdown: **Where Are You Losing?**" on one line at label size, the question in red.
Text contrast raised page-wide and **measured, not eyeballed**: every label now clears AAA, and the
LIGHT theme had three real failures nobody had checked (`--ink3` at 2.56:1, below AA outright).
Wins/losses/breakevens replace the "8L" letter notation as coloured figures — green / red / orange —
which needed the backend to start carrying win and breakeven counts at all; it only ever counted
losses.

**2026-08-29 — the Drawdown page contradicted itself, and the cause was five copies of one rule.**
The headline "Max Drawdown" and the Edge & Risk card's "actual max drawdown" are the same
quantity computed in different modules; they disagreed by up to **23 percentage points**, and
risk-of-ruin was wrong in **both** directions (41.8% where it should read 17.9%). Root cause:
"walk a trade list into a running balance" was written out five times and had drifted into three
behaviours. Now one shared definition, plus deterministic tie-breaks so equal-valued rows cannot
swap on reload. 11 of 12 sections byte-identical after the change; 16 checks with teeth.

Kept short on purpose. The **detail** lives in each strategy's fix log; this is the timeline so you
can see at a glance whether an area has been touched recently.

| date | area | what changed | shipped? |
|---|---|---|---|
| 25 Aug | BX zones | Tap = overlap. Three one-sided copies fixed together | deployed |
| 25 Aug | BX zones | Extreme zone defined; decisional became a creation fact, not a ranking | deployed |
| 25 Aug | BX zones | A zone must break a pre-existing level; my measurement rule deleted | deployed |
| 23 Aug | BX | Measurement harnesses saved to `signal_platform/tools/`; one-year baseline recorded | — |
| 23 Aug | Frontend | Assets page contrast; FX Copier light theme; static-file caching | deployed |
| 23 Aug | BX | Signal 1 = respect + pullback; advisory path when the pullback lands on no zone | — |
| 22 Aug | BX | Liquidity sweep became a gate on turn validity | — |
| 15 Aug | BX | Extreme vs decisional introduced (the positional version — superseded 25 Aug) | — |

---

## The rules that keep being broken, so they are here too

1. **Read the code before saying what it does.** Quote `file:line`. A grep with no hits is not proof
   a rule is gone — it may have moved. A comment saying a rule exists is **not** evidence the code
   has it; that exact claim was false for six days.
2. **Find EVERY copy before fixing one.** The tap bug was reported as one place and was three.
3. **Fix the underlying problem, not the symptom.** "It happens less often" is not a fix.
4. **Every symptom he names is its own defect** until disproved. Dropping one silently is how the
   real cause survives.
5. **Reproduce the actual event**, not a lookalike — from what the system recorded or sent.
6. **Say "I have not checked"** rather than inferring. Two claims about the tap bug were asserted and
   later had to be retracted.
