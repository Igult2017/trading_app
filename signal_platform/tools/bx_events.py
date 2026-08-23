"""WHICH BX CHECK REFUSES A REAL CHANGE OF CHARACTER? The diagnosis tool.

    python tools/bx_events.py                      # EUR/USD, 3 months
    python tools/bx_events.py --months 6 --detail  # ...and name the zone behind each refusal

NOT A BACKTEST — it scores nothing, reports no rate and passes no verdict on the method. It finds
changes of character from RAW CANDLES with no BX code involved, then walks each one through BX's
checks in the order BX applies them and records the FIRST check that refuses it. Safe to run.

WHY THIS IS THE TOOL THAT FINDS THINGS. Every real defect found on 2026-08-23 came from it, because
the events are an independent list: they come from reading candles, not from BX marking its own
homework. When a check is broken, this says which one and how many it costs.

*** READ THIS BEFORE QUOTING ANY NUMBER IT PRINTS ***

A refusal here is NOT automatically a defect. Most are BX correctly applying his rules. Measured on
2026-08-23, of 19 events and 17 refusals, NINE were the rules working as intended. The mistake that
cost hours was reporting a count and attaching an explanation to it without checking the explanation.

In particular, "no live zone marked where price reacted" has FOUR possible causes and this tool
cannot tell them apart on its own:
    1. BX genuinely drew no zone there                                  <- a defect
    2. BX drew one NEARBY that does not contain the exact price         <- this tool being strict
    3. BX drew one and price later BROKE it                             <- the rule working (4 of 5!)
    4. the swing detector below picked the wrong price for the turn     <- this tool being wrong
Use `--detail` to separate them before concluding anything.

The turning point is found with a 3-bar swing rule that is THIS TOOL'S OWN, not BX's. It is a
reasonable reading of the chart and it is not authoritative.
"""
import argparse
import collections
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://u:p@127.0.0.1:1/none")

from data.candle_aggregator import aggregate                           # noqa: E402
from shared.pip import pip_size                                        # noqa: E402
from strategies import bx_sd_lineage as L                              # noqa: E402
from strategies.bx_sd_liquidity import find_liquidity                  # noqa: E402
from strategies.bx_sd_registry import build                            # noqa: E402
from tools.bx_data import Feed, load                                   # noqa: E402


def swings(bars, n=3):
    """Pivots: a bar higher/lower than the `n` bars either side. This tool's own reading."""
    out = []
    for i in range(n, len(bars) - n):
        hi, lo = bars[i].high, bars[i].low
        if all(hi > bars[j].high for j in range(i - n, i)) and \
           all(hi > bars[j].high for j in range(i + 1, i + n + 1)):
            out.append((i, hi, "H"))
        if all(lo < bars[j].low for j in range(i - n, i)) and \
           all(lo < bars[j].low for j in range(i + 1, i + n + 1)):
            out.append((i, lo, "L"))
    out.sort()
    return out


def find_events(h4, lo):
    """Changes of character: the trend was up and price closed under the last higher low, or the
    mirror. Returns (bar index, direction, the price the turn came from)."""
    w = h4[lo:]
    sw = swings(w)
    events, trend, si = [], 0, 0
    last_h = last_l = prev_h = prev_l = None
    for i in range(len(w)):
        while si < len(sw) and sw[si][0] <= i - 3:       # a swing is known only n bars later
            _idx, price, kind = sw[si]
            if kind == "H":
                prev_h, last_h = last_h, price
            else:
                prev_l, last_l = last_l, price
            if last_h and prev_h and last_l and prev_l:
                if last_h > prev_h and last_l > prev_l:
                    trend = 1
                elif last_h < prev_h and last_l < prev_l:
                    trend = -1
            si += 1
        c = w[i].close
        if trend == 1 and last_l is not None and c < last_l:
            events.append((lo + i, "bearish", last_h)); trend, last_l = -1, None
        elif trend == -1 and last_h is not None and c > last_h:
            events.append((lo + i, "bullish", last_l)); trend, last_h = 1, None
    return events


def diagnose(pair="EURUSD", months=3, detail=False):
    h4 = load(f"{pair}_H4real.csv", "H4")
    m1 = load(f"{pair}_M1.csv", "M1")
    pip = pip_size(pair[:3] + "/" + pair[3:])
    m15 = Feed(aggregate(m1, "M15"))
    end = min(h4[-1].time, m1[-1].time)
    lo = next(i for i, c in enumerate(h4) if c.time >= end - months * 30 * 24 * 3600)

    events = find_events(h4, lo)
    print(f"\n{len(events)} changes of character on {pair} 4-hour over {months} months, "
          f"counted from raw candles with no BX involved.")
    print("Each is walked through BX's checks; the FIRST one that refuses it is recorded.\n")

    why = collections.Counter()
    notes = []
    for i, direction, extreme in events:
        if extreme is None:
            why["my own swing reading had incomplete structure"] += 1
            continue
        window = h4[max(0, i - 1000):i]
        ses = m15.before(h4[i].time, 1200)
        book = build(window, pip, session_candles=ses)
        pools = find_liquidity(window, pip, session_candles=ses)
        want = "supply" if direction == "bearish" else "demand"
        near = [z for z in book if z.direction == want and z.bottom <= extreme <= z.top
                and z.state != "broken"]
        if not near:
            why["no live zone where price turned  (see the header - FOUR causes)"] += 1
            if detail:
                broken = [z for z in book if z.direction == want
                          and z.bottom <= extreme <= z.top and z.state == "broken"]
                if broken:
                    notes.append(f"  {extreme:.5f}: BX DID draw {broken[0].bottom:.5f}-"
                                 f"{broken[0].top:.5f} — price had BROKEN it. Rule working.")
                else:
                    notes.append(f"  {extreme:.5f}: no {want} zone here at all — worth a look.")
            continue
        par = max(near, key=lambda z: z.marked_at)
        if par.mitigated_at is None:
            why["the zone was never recorded as tapped"] += 1; continue
        if par.respected_at is None:
            why["price never stayed clear of the zone (REACT_BARS)  — his rule"] += 1; continue
        if not (L.swept_before_tap(par, window, pools) or L.same_side_zone_broken_before(par, book)):
            why["no liquidity taken on the way in  — his rule"] += 1; continue
        kid = L.child_of(par, book)
        if kid is None:
            why["the reaction left no zone behind to enter on  — open defect 0u"] += 1
            if detail:
                notes.append(f"  {par.bottom:.5f}-{par.top:.5f} reacted but left nothing "
                             f"(tapped by {par.mitigation_kind})")
            continue
        if not L.choch_complete(kid):
            why["the move broke no opposite zone  — his rule"] += 1; continue
        why["REACHES THE ENTRY GATE"] += 1

    for k, v in why.most_common():
        print(f"   {v:>3}  {k}")
    if notes:
        print("\n   detail:")
        for n in notes:
            print(n)
    print("\n   Reaching the entry gate is NOT a signal — the 1M/5M confirmation still follows.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--pair", default="EURUSD")
    ap.add_argument("--months", type=int, default=3)
    ap.add_argument("--detail", action="store_true")
    diagnose(**vars(ap.parse_args()))
