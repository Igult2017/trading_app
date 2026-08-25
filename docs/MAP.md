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

### "Why is the site slow / the logo late / the theme wrong?"

[performance-audit.md](./performance-audit.md), then the client files. Caching lives in
`server/static.ts`.

### "Why didn't the platform tell me it was down?"

[signal-platform-observability.md](./signal-platform-observability.md).

### "Copy trading"

[copy-platform.md](./copy-platform.md) and [copy-trading-setup.md](./copy-trading-setup.md).

### "cTrader connection / tokens / the blocked app"

[ctrader-open-api-apps.md](./ctrader-open-api-apps.md).

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

---

## PROGRESS — what actually happened, newest first

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
