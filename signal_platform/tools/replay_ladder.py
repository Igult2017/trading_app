"""
REPLAY THE AUTOTRADE MANAGER OVER TWO REAL TRADES.

His ask, 2026-09-02: *"can you replay the two signals that we lost today and tell me if it can win one
and breakeven in another... We reached 2R then sine the autotrade manager failed, price came back and
we lost in the last signal."*

WHAT THIS IS AND IS NOT. It is a replay of the LADDER — the thing that moves the stop — over the
minute-by-minute prices of two specific real trades, using the REAL functions from `monitor/rungs.py`
rather than a re-implementation of them. It is NOT a score of VIX.1: it takes the entry, stop and
target the broker actually recorded and asks one question only — where would the stop have been.

THE PRICES ARE REAL, pulled from his Pepperstone demo account (M1 bars) and stored beside this file.
The entries, stops and targets are the ones on the broker's own ENTRY ORDERS.

THE ONE HONEST LIMITATION, stated up front: a one-minute bar records its high and its low but not the
ORDER they happened in. Where both the new stop and the old stop are touched inside the same minute,
this replay assumes the WORSE case — the stop is checked before it is raised. So every number below
is the pessimistic reading, never a flattering one.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from monitor import rungs as R

BARS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "replay_bars.json")
PIPETTE = 100_000.0          # cTrader reads are pipettes for every symbol — verified 2026-07-30


class Trade:
    def __init__(self, name, symbol, bullish, entry, stop, target, bars,
                 opened_ms, closed_ms, spread=0.0, signal_entry=None, digits=5):
        self.name, self.symbol, self.bullish = name, symbol, bullish
        self.entry, self.orig_stop, self.target = entry, stop, target
        self.d = digits
        self.risk = abs(entry - stop)
        # ONLY THE MINUTES THE POSITION WAS ACTUALLY OPEN. The first draft replayed the whole window
        # I had pulled, so it "stopped out" at 14:00 on a trade that did not exist until 14:03 —
        # a stop cannot be hit before the trade is placed. The bar containing the entry is included
        # (its timestamp is the minute's START), the one after the close is not.
        self.bars = [b for b in bars
                     if b["timestamp"] + 60_000 > opened_ms and b["timestamp"] <= closed_ms]
        self.opened_ms, self.closed_ms = opened_ms, closed_ms
        # THE BARS ARE BID PRICES. A LONG exits by selling at the bid, so no adjustment. A SHORT
        # exits by BUYING AT THE ASK, which is the bid plus the spread — so every price a short is
        # judged on must have the spread added, or the trade looks better than it was and its stop
        # looks untouched when it was hit. Measured on this trade: it exited at 1.34882 in the minute
        # whose bid high was 1.34873, so the spread was ~0.9 pips.
        self.spread = spread
        # What the SIGNAL asked for, against what the broker actually gave us. The ladder measures R
        # from the FILL, because that is the position it is managing.
        self.signal_entry = signal_entry

    def ask(self, bid):
        return bid + self.spread if not self.bullish else bid

    def r_at(self, price):
        move = (price - self.entry) if self.bullish else (self.entry - price)
        return move / self.risk


def replay(t: Trade, strategy="vix1"):
    ladder = R.ladder_for(strategy)
    trail  = R.trail_for(strategy)
    stop   = t.orig_stop
    done   = set()
    best_r = 0.0
    best_price = t.entry
    events = []

    for b in t.bars:
        hi, lo = b["high"] / PIPETTE, b["low"] / PIPETTE
        # For a short both are shifted up by the spread — see Trade.ask.
        favourable = hi if t.bullish else t.ask(lo)   # the direction the trade wants
        adverse    = lo if t.bullish else t.ask(hi)   # the direction that stops it out

        # WORST CASE FIRST: was the stop as it stands taken this minute?
        hit = (adverse <= stop) if t.bullish else (adverse >= stop)
        if hit:
            events.append((b["timestamp"], f"STOPPED OUT at {stop:.{t.d}f}", t.r_at(stop)))
            return dict(exit_price=stop, exit_r=t.r_at(stop), best_r=best_r, events=events,
                        best_price=best_price, reason="stop hit")

        # Did it reach the target?
        reached_tp = (hi >= t.target) if t.bullish else (lo <= t.target)
        if reached_tp:
            events.append((b["timestamp"], f"TARGET at {t.target:.{t.d}f}", t.r_at(t.target)))
            return dict(exit_price=t.target, exit_r=t.r_at(t.target), best_r=best_r, events=events,
                        best_price=best_price, reason="target hit")

        # Then raise the stop for whatever this minute earned. THE REAL LADDER decides.
        r = t.r_at(favourable)
        if r > best_r:
            best_r, best_price = r, favourable
        for rung in R.reached(ladder, r, trail):
            if rung.tag in done:
                continue
            if rung.lock_r is None:
                new_stop = t.entry          # breakeven; the real one adds costs, which only makes
                                            # it slightly better for him, so this is the cautious form
            else:
                new_stop = R.stop_price_for(rung, t.entry, t.risk, t.bullish)
            if new_stop is None:
                continue
            # RATCHET ONLY — a stop never moves against the trade. Same rule as the live tracker.
            better = (new_stop > stop) if t.bullish else (new_stop < stop)
            if better:
                stop = new_stop
                done.add(rung.tag)
                events.append((b["timestamp"], f"{rung.tag}: stop -> {stop:.{t.d}f}", r))

    return dict(exit_price=None, exit_r=None, best_r=best_r, events=events,
                best_price=best_price, reason="still open at the end of the window")


def show(t: Trade, res, actual_exit):
    import datetime as dt
    ts = lambda v: dt.datetime.fromtimestamp(v / 1000, dt.timezone.utc).strftime("%H:%M")
    print(f"\n{'=' * 78}\n{t.name}  —  {'LONG' if t.bullish else 'SHORT'} {t.symbol}")
    print(f"  entry {t.entry:.{t.d}f} · stop {t.orig_stop:.{t.d}f} "
          f"· target {t.target:.{t.d}f} · risk {t.risk * PIPETTE / 10:.1f} pips")
    print(f"  minutes replayed: {len(t.bars)} (only while the position was open)")
    print(f"  furthest it ran in his favour: {res['best_r']:+.2f}R   "
          f"(this is what the ladder sees — measured from the FILL)")
    if t.signal_entry is not None:
        srisk = abs(t.signal_entry - t.orig_stop)
        best_price = res.get("best_price")
        if best_price is not None:
            sr = (t.signal_entry - best_price) / srisk if not t.bullish                  else (best_price - t.signal_entry) / srisk
            print(f"  ...but measured from the SIGNAL's entry {t.signal_entry:.{t.d}f} "
                  f"(risk {srisk * PIPETTE / 10:.1f} pips) it was {sr:+.2f}R")
    print(f"\n  WHAT THE MANAGER WOULD HAVE DONE:")
    if not res["events"]:
        print("    (nothing — it never reached the first rung)")
    for tstamp, what, r in res["events"]:
        print(f"    {ts(tstamp)}  {what}   (at {r:+.2f}R)")
    ar = t.r_at(actual_exit)
    print(f"\n  ACTUAL (manager was not running): exited {actual_exit:.{t.d}f} = {ar:+.2f}R")
    if res["exit_r"] is not None:
        print(f"  REPLAY  (manager running):        exited {res['exit_price']:.{t.d}f} "
              f"= {res['exit_r']:+.2f}R   [{res['reason']}]")
        print(f"  DIFFERENCE: {res['exit_r'] - ar:+.2f}R")
    else:
        print(f"  REPLAY  (manager running):        {res['reason']}")


if __name__ == "__main__":
    data = json.load(open(BARS))

    # Both trades as the BROKER recorded them: fills from the deals, stops and targets from the
    # entry orders. Nothing here is chosen by me.
    eur = Trade("EUR/USD  01 Sep 14:03 -> 14:49  (position 239582511)", "EURUSD",
                bullish=True,  entry=1.16046, stop=1.15986, target=1.16295,
                bars=data["EURUSD"],
                opened_ms=1788271402114, closed_ms=1788274166750,
                signal_entry=1.16048)
    gbp = Trade("GBP/USD  02 Sep 09:54 -> 11:09  (position 239821023)", "GBPUSD",
                bullish=False, entry=1.34880, stop=1.34939, target=1.34672,
                bars=data["GBPUSD"],
                opened_ms=1788342844240, closed_ms=1788347398654,
                spread=0.00009, signal_entry=1.34886)

    show(eur, replay(eur), actual_exit=1.15983)
    show(gbp, replay(gbp), actual_exit=1.34882)
    print()
