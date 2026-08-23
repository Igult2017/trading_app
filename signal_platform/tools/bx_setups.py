"""HOW MANY QUALIFYING SETUPS DOES BX PRODUCE PER MONTH? Signal 1 and signal 2, counted separately.

    python tools/bx_setups.py                 # one year of EUR/USD (the standing baseline)
    python tools/bx_setups.py --months 3
    python tools/bx_setups.py --pair GBPUSD --months 6

A BACKTEST. **Ask before running it** — the standing rule is that any historical simulation which
scores the strategy needs his explicit approval, and frequency sweeps are named in it. Approval for
one run is not approval for the next.

QUALIFYING SETUPS ONLY — it stops BEFORE the 1M/5M confirmation entry, on his instruction
(*"Just qualifying setups. Dont go to entry"*). Frequency only: no win rate, no R, no profit, no
verdict on the method.

    signal 2   `detect_setup` says active — a zone tapped that passed every 4-hour check.
    signal 1   the window is open (zone tapped and RESPECTED, no opposite zone broken yet) AND a
               pullback is happening: either it landed on a 1H/30M/15M zone, or it has started
               ending with no zone there (the advisory).

COUNTED ONCE EACH, on the identity production dedups on, so a setup live for several bars is one
event rather than one per bar.

TWO LIMITS, STATED RATHER THAN HIDDEN:
  * ONE EVALUATION PER CLOSED 4H BAR, with that bar as the FORMING one. Production scans every 60s,
    so inside one bar it gets ~240 looks at a moving live price where this gets one look at the
    bar's whole range. For "is price tapping the zone right now" the full range is more generous
    than a mid-bar snapshot and one look is less generous than 240; the two pull opposite ways and
    the net is not known to be zero.
  * THE BOOK SEES ONLY CLOSED BARS — at step i it is built from bars[:i], strictly earlier.
    `closed_only` cannot do this in a replay, because every historical bar is long closed and it
    would drop nothing.
"""
import argparse
import collections
import os
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://u:p@127.0.0.1:1/none")

from data.candle_aggregator import aggregate                           # noqa: E402
from shared.pip import pip_size                                        # noqa: E402
from strategies import bx_sd_signal1 as S1                             # noqa: E402
from strategies.bx_sd_pullback import pullback_state                   # noqa: E402
from strategies.bx_sd_registry import build                            # noqa: E402
from strategies.bx_sd_setup import detect_setup                        # noqa: E402
from tools.bx_data import Feed, day_of, load, month_of                 # noqa: E402

ON_ZONE = "signal 1 (on a zone)"
ADVISORY = "signal 1 (no zone - advisory)"
SIGNAL2 = "signal 2"
COLS = [ON_ZONE, ADVISORY, SIGNAL2]


def run(pair: str, months: int) -> dict:
    h4 = load(f"{pair}_H4real.csv", "H4")
    # THE FULL MINUTE FILE, never the 145-day extract — see the warning in `bx_data`.
    m1 = load(f"{pair}_M1.csv", "M1")
    pip = pip_size(pair[:3] + "/" + pair[3:])
    feeds = {k: Feed(aggregate(m1, k)) for k in ("M15", "M30", "H1")}

    end = min(h4[-1].time, m1[-1].time)
    start = end - months * 30 * 24 * 3600
    lo = next(i for i, c in enumerate(h4) if c.time >= start)
    hi = next((i for i, c in enumerate(h4) if c.time > end), len(h4))
    print(f"{pair}  {hi - lo} closed 4H bars  {day_of(h4[lo].time)} to {day_of(end)}", flush=True)

    rows = collections.defaultdict(collections.Counter)
    seen, t0 = set(), time.time()
    for n, i in enumerate(range(lo, hi)):
        t = h4[i].time
        rows[month_of(t)][SIGNAL2] += 0                  # so an empty month still prints
        window = h4[max(0, i - 1000):i]                  # CLOSED bars only — never bar i
        if len(window) < 60:
            continue
        ses = feeds["M15"].before(t, 1200)
        book = build(window, pip, session_candles=ses)
        live = h4[i]                                     # the FORMING bar, as production sees it
        mth = month_of(t)

        r = detect_setup(h4[max(0, i - 1000):i + 1], pip, book=book, session_candles=ses)
        if r.active and r.zone is not None:
            key = ("s2", round(r.zone.top, 6), round(r.zone.bottom, 6), r.direction)
            if key not in seen:
                seen.add(key); rows[mth][SIGNAL2] += 1

        books = S1.build_mtf_books(feeds["H1"].before(t, 200), feeds["M30"].before(t, 200),
                                   feeds["M15"].before(t, 200), pip)
        for ext in book:
            if not S1.window_open(ext, book, window):
                continue
            d = "buy" if ext.direction == "demand" else "sell"
            pz, _leg = S1.pullback_zone(d, live, books)
            if pz is not None:
                key = ("s1", ext.ifc_time, ext.direction, ext.mitigated_at)
                if key not in seen:
                    seen.add(key); rows[mth][ON_ZONE] += 1
                break
            # `build_mtf_books` keys are "1H" / "30M" / "15M"; each value is (zones, candles).
            st = pullback_state(books["15M"][1] or [], d, ext.respected_at or 0)
            if st.ending:
                key = ("s1adv", ext.ifc_time, ext.direction, st.turn_at)
                if key not in seen:
                    seen.add(key); rows[mth][ADVISORY] += 1
                break            # counted one — production sends one signal 1 per scan
            # NOT counted: keep looking at the other open windows. Breaking here regardless would
            # let the first window-open zone hide every other one behind it.
        if n and n % 200 == 0:
            print(f"   ...{n}/{hi - lo}  {time.time() - t0:.0f}s", flush=True)
    print(f"done in {time.time() - t0:.0f}s\n", flush=True)
    return rows


def report(rows: dict) -> None:
    print(f"{'month':<10}" + "".join(f"{c:<32}" for c in COLS))
    for mth in sorted(rows):
        print(f"{mth:<10}" + "".join(f"{rows[mth][c]:<32}" for c in COLS))
    total = {c: sum(rows[m][c] for m in rows) for c in COLS}
    n = max(1, len(rows))
    print(f"\n{'TOTAL':<10}" + "".join(f"{total[c]:<32}" for c in COLS))
    print(f"{'PER MONTH':<10}" + "".join(f"{total[c] / n:<32.1f}" for c in COLS))
    print(f"\n({n} months counted; the first and last are usually part months)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--pair", default="EURUSD")
    ap.add_argument("--months", type=int, default=12)
    a = ap.parse_args()
    report(run(a.pair, a.months))
