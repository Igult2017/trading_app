"""
VIX.1 — HIS ✅ TRADEABLE / ⛔ UNTRADEABLE PRESS on a momentum-candle announcement (16 Nov 2026).

His ask: *"Whenever momentum candle closure is sent it should contain a button that asks if a trade
should be taken there, then the system starts waiting for entry and once entry is ready it takes a
trade there … the button should be tradeable and untradeable."* His answers: the press overrides the
SETUP checks (trend, range, chop, stomach rule, void…); the entry rule, the news rule and the safety
checks still apply; the 7pm cut-off does not (*"It can be any time"*); the trade goes to his DM only and
is placed whatever the switches say; a mark lasts until a newer momentum candle on the pair, the trade,
or 24 h.

ONE QUESTION, ASKED ONCE PER SCAN, right after `detect_bias`: given the setup the strategy found (or
None), and his marks on this pair, which setup — if any — goes on to the 1M entry search?

  * the strategy's candle is marked UNTRADEABLE  → no setup (his veto)
  * he marked a candle TRADEABLE that is still in the H1 window, and it is not older than the strategy's
    own candle → THAT candle is the setup, whatever `detect_bias` said about it

No mark → exactly the strategy's own answer. That is the line that keeps everything else unchanged.
"""
from strategies.vix1_state import Bias


def apply(h1: list, symbol: str, bias: Bias | None) -> tuple[Bias | None, dict | None, str | None]:
    """(the setup to use, his Tradeable mark that produced it or None, why vetoed or None)."""
    try:
        from storage import candle_marks
        marks = candle_marks.marks_for(symbol)
    except Exception:
        marks = []
    if not marks:
        return bias, None, None
    times = {c.time: i for i, c in enumerate(h1)}
    own_time = h1[bias.mc_idx].time if bias is not None else None
    if own_time is not None and any(m["bar_time"] == own_time and m["status"] == "untradeable"
                                    for m in marks):
        return None, None, "you marked this momentum candle UNTRADEABLE"
    tradeable = [m for m in marks if m["status"] == "tradeable" and m["bar_time"] in times]
    if not tradeable:
        return bias, None, None
    mark = max(tradeable, key=lambda m: m["bar_time"])
    if own_time is not None and own_time > mark["bar_time"]:
        return bias, None, None          # the strategy's own candle is NEWER: his older mark is stale
    return Bias(bullish=mark["bullish"], mc_idx=times[mark["bar_time"]], origin="marked", run_len=1,
                reason="you marked this momentum candle TRADEABLE"), mark, None


def stamp(sig, mark: dict | None) -> None:
    """A trade built from his Tradeable mark: his DM only, placed whatever the switches say, the 7pm
    cut-off lifted — every other check still runs (`guards.check`, the placer)."""
    if mark is not None:
        sig.manual, sig.confirmed, sig.mark_id = True, True, mark["id"]
