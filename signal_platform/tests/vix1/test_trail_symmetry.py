"""A SELL'S STOP MOVES LIKE A BUY'S — the gap is measured off the price that FIRES it.

His question, 20 Sep 2026: *"how can we move SL in sell the same way we do in buy?"*

WHY IT DID NOT. A buy's stop fires on the sell price (bid) — the number on his chart — so a gap of 0.2R
really was 0.2R. A sell's stop fires on the BUY price (ask), one spread further on, while the ladder
reads the chart price and priced the stop off the ENTRY. On his 18 Sep EUR/USD sell the stop was 5.3
pips and the spread 1.0 pip, so 0.19R of the 0.2R gap was spread: the stop landed ~0.01R from the ask,
`breakeven.why_not` refused it as through the market 135 times, and the trail never moved once.

WHAT IS ASSERTED HERE: the same trade, once as a buy and once as a sell, must put its stop the same real
distance from its own firing price; a trailing move must survive `why_not` even when the spread is wider
than the gap (his 16 Sep sell: 2.5-pip stop, 1.5-pip spread = 0.60R); and BREAKEVEN must still be refused
rather than pushed away from his costs, because breakeven is a price he defined, not a distance.

Real functions throughout: `position_tracker._lines`, `monitor.stop_placement`, `breakeven.why_not`.
"""
from _harness import Suite
from config.settings import settings
from data.ctrader_positions import Position
from execution import breakeven
from monitor import position_tracker as T
from monitor import rungs, stop_placement

s = Suite("VIX.1 — a sell's stop is placed with the same room as a buy's")
object.__setattr__(settings, "auto_breakeven_enabled", True)
object.__setattr__(settings, "auto_breakeven_demo_only", False)

RISK = 0.00053                       # his 18 Sep EUR/USD sell: a 5.3-pip stop
SPREAD = 0.00010                     # and a 1.0-pip spread — 0.19R of it


def pos(bullish, entry=1.14693, stop=None, pid=1):
    start = entry - RISK if bullish else entry + RISK
    return Position(position_id=pid, symbol="EUR/USD", bullish=bullish, volume=100000, entry=entry,
                    stop=(start if stop is None else stop), target=None, commission=0.0, swap=0.0,
                    opened_at=0, start_stop=start)


def trail_price(p, r, bid):
    """The stop the live code would send for the trailing step, at this R and this chart price."""
    guard = bid if p.bullish else bid + SPREAD
    out = [sl for tag, sl, _m in T._lines(p, r, bid, guard) if tag.startswith("trail_")]
    return (out[0] if out else None), guard


# ── THE GAP IS REAL ON BOTH SIDES ───────────────────────────────────────────
buy = pos(True)
sell = pos(False)
b_sl, b_fire = trail_price(buy, 2.4, buy.entry + 2.4 * RISK)
s_sl, s_fire = trail_price(sell, 2.4, sell.entry - 2.4 * RISK)
# Prices land on the pair's real steps (0.00001 here), so a gap is exact to within one of those —
# 0.0189R on this 5.3-pip stop. It is always rounded AWAY from the market, never closer.
s.check("a BUY at 2.4R trails 0.2R below the price its stop fires on",
        round((b_fire - b_sl) / RISK, 1), 0.2)
s.check("a SELL at 2.4R trails 0.2R above the price ITS stop fires on",
        round((s_sl - s_fire) / RISK, 1), 0.2)
s.check("neither side is ever given LESS room than the rule asks for",
        (b_fire - b_sl) >= 0.2 * RISK and (s_sl - s_fire) >= 0.2 * RISK, True)
s.check("the two are mirror images — the same room, measured the same way",
        round((b_fire - b_sl) - (s_sl - s_fire), 7), 0.0)

# THE DEFECT ITSELF: priced off the entry, the sell's stop sat inside the spread — 0.6 of one price
# step above the buy price. It was still legal at that instant, which is exactly why it looked fine.
_old = rungs.stop_price_for(rungs.trailing_rung(rungs.trail(), 2.4), sell.entry, RISK, False)
s.check("the OLD way left a sell only 0.01R of room, not 0.2R",
        round((_old - s_fire) / RISK, 2), 0.01)
# ONE TICK AGAINST THE TRADE IS ALL IT TAKES. Move the buy price up a single step — which happened
# 135 times on the 18 Sep trade — and the old placement is refused while the new one still stands.
_tick = s_fire + 0.00001
s.teeth("one step against the trade and the old placement is refused",
        breakeven.why_not(sell, "demo", _old, _tick) is not None
        and breakeven.why_not(sell, "demo", s_sl, _tick) is None)

# ── AND THE NEW PLACEMENT IS ALWAYS ACCEPTED ────────────────────────────────
s.check("the new sell stop passes the through-the-market check",
        breakeven.why_not(sell, "demo", s_sl, s_fire), None)
s.check("so does the buy's", breakeven.why_not(buy, "demo", b_sl, b_fire), None)

# HIS 16 SEP GBP/USD SELL: a 2.5-pip stop against a 1.5-pip spread — 0.60R of spread, wider than any
# rung's gap. Today EVERY step on a trade like this is refused and the stop never moves at all.
TIGHT, TSPREAD = 0.00025, 0.00015
tight = Position(position_id=9, symbol="GBP/USD", bullish=False, volume=100000, entry=1.34548,
                 stop=1.34573, target=None, commission=0.0, swap=0.0, opened_at=0, start_stop=1.34573)
t_bid = tight.entry - 2.4 * TIGHT
t_fire = t_bid + TSPREAD
t_sl = [sl for tag, sl, _m in T._lines(tight, 2.4, t_bid, t_fire) if tag.startswith("trail_")][0]
s.check("a 0.60R spread cannot stop the trail being placed",
        breakeven.why_not(tight, "demo", t_sl, t_fire), None)
s.check("...and it still protects real profit", round((tight.entry - t_sl) / TIGHT, 1) > 1.0, True)

# ── A FIXED LOCK IS PUSHED OUT, NEVER INSIDE THE SPREAD ─────────────────────
# +1R at 1.5R leaves 0.5R of room, which is impossible against a 0.60R spread. It locks slightly less
# than its name rather than being refused and leaving the stop where it was.
l_bid = tight.entry - 1.5 * TIGHT
l_fire = l_bid + TSPREAD
lock = [sl for tag, sl, _m in T._lines(tight, 1.5, l_bid, l_fire) if tag == "lock_1r"][0]
s.check("the +1R lock is pushed out to the minimum gap when the spread eats it",
        round((lock - l_fire) / TIGHT, 1), stop_placement.MIN_GAP_R)
s.check("...and is therefore accepted", breakeven.why_not(tight, "demo", lock, l_fire), None)
# On a normal spread it is untouched: 0.5R of room is plenty, so the rung keeps its own price.
n_bid = sell.entry - 1.5 * RISK
n_lock = [sl for tag, sl, _m in T._lines(sell, 1.5, n_bid, n_bid + SPREAD) if tag == "lock_1r"][0]
s.check("a normal spread leaves the +1R lock exactly where the rung says",
        round(n_lock, 5), round(sell.entry - RISK, 5))

# ── BREAKEVEN IS NEVER MOVED ────────────────────────────────────────────────
# It is the price where he loses nothing — pushing it away from the market would make it a small loss.
be_bid = sell.entry - 0.4 * RISK
be = [sl for tag, sl, _m in T._lines(sell, 0.4, be_bid, be_bid + SPREAD) if tag == "breakeven"][0]
s.check("breakeven stays the net-zero price, whatever the spread", be, sell.breakeven())
s.teeth("a breakeven that cannot be placed is refused, not nudged into a loss",
        breakeven.why_not(sell, "demo", sell.breakeven(), sell.breakeven() + 0.00001) is not None)

# ── WITHOUT A FIRING PRICE, NOTHING IS INVENTED ─────────────────────────────
# A caller with one price (the bar replay tool) still gets the rung's own level, not a guess.
plain = [sl for tag, sl, _m in T._lines(sell, 2.4, sell.entry - 2.4 * RISK) if tag.startswith("trail_")]
s.check("no firing price -> the rung's own level, unchanged", round(plain[0], 5), round(_old, 5))

s.done()
