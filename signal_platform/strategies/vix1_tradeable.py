"""
VIX.1 — IS THIS MARKET WORTH TRADING AT ALL? Ranging, quiet or choppy means we stand aside.

HIS THREE DEFINITIONS, in his own words (2026-09-04), each answered by a separate test below:

    RANGING  "one that is not printing HHs and HLs for an uptrend and LLs and LHs for a downtrend."
    QUIET    "one that has no momentum candles which I call volume candles. It means that market
              has no activities."
    CHOPPY   "it can be trending but prints 1 red volume candle then prints a bullish candle,
              meaning it has no specific group of candles in succession" — and a mixture of
              "big bodies, small bodies, long wicks and no wicks."

WHY THIS FILE EXISTS. His proof rule — *it runs, pulls back, then we enter* — guards the moment a
trend is BORN (`vix1_choch`, for a turn down). **Nothing re-examined the trend afterwards.** Once
"uptrend" was on the books every momentum candle traded on that credential, however dead the market
had become since. Measured on three charts he marked as untradeable: VIX.1 fired **12 signals**,
all twelve through the normal trend route, none through the reversal route.

NOTHING HERE INVENTS A MARKET CONCEPT. His instruction: *"A trend proving itself is already in the
code, you can just borrow it. Avoid reinventing the wheel."* So:

    the run       `TrendState.bos_index`  — the break of structure the trend engine already records
    the pullback  `vix1_swings.structure_turns` — the same confirmed turns every other rule reads
    momentum      `vix1_momentum.is_momentum_candle` — HIS 2.5 rule, imported and NOT re-implemented

That last one matters most: reusing the entry's own momentum test means "what counts as a momentum
candle" can never drift between the two places that ask it.

THE REVERSAL ROUTE IS DELIBERATELY NOT GUARDED BY THIS. `vix1_choch` has its own rules and its own
proof, and his one marked TRADEABLE example (EUR/USD 03 Sep 2026) comes through it with the WEAKEST
structure of any window measured — highs -2.1x, lows -21.7x. A liveness test applied there would
refuse the very setup this whole thread began with.

MEASURED, five ideas that FAILED to tell his charts apart, recorded so they are not retried: candle
colour succession · his "closes beyond each other" reading · follow-through after a big candle ·
biggest sustained push · momentum-candle succession. At the signal moments his rejected markets were
trending MORE decisively than his accepted one, so nothing that leans on strong structure can work.
"""
from core.types import Candle
from shared.candle_math import is_bearish, is_bullish
from strategies.vix1_momentum import is_momentum_candle


def trend_reproven(tstate, turns) -> str | None:
    """HIS RULE: has the trend RUN and then PULLED BACK? The refusal reason, or None to allow.

    *"if the market was ranging and has no volume in 1HR and then it starts building momentum, it
    must prove that before we hop in. Proving it means it runs, pulls back then we enter."*

    Both halves are read off state that already exists — the trend engine's own break of structure
    (`bos_index`, "the trend continues"), and a confirmed turn after it facing AGAINST the trend,
    which is what a pullback is. **No threshold, no window, no new number**: the sequence either
    happened or it did not, exactly like the reversal route's window, whose own note says *"Both
    edges come from his own rules; nothing here is calibrated."*

    MEASURED on his three charts: refuses 6 of the 12 — every signal in image 3, the market he called
    ranging with no momentum. Those all fail on the same clause: the trend ran once and never pulled
    back, so it was still trading on a credential it earned long before.
    """
    if tstate is None or tstate.direction == 0:
        return None                     # no trend here to re-prove; other gates own that case

    # WHERE "THE RUN" IS, and getting this wrong broke two of his existing tests. The obvious
    # reading — the most recent break of structure (`bos_index`) — is WRONG for a trend that has
    # just been established, because `_establish` (`vix1_trend.py:261-263`) sets `direction`,
    # `protected`, `breaks` and `direction_since` but **never `bos_index`**. So a brand-new trend
    # reads as "never ran" while it was established by making two higher highs and two higher lows,
    # which IS running. Left uncorrected this refused his own 2026-08-25 bearish proof — the SELL
    # that must trade once a turn has run, pulled back and turned back down — caught by
    # `test_choch_bearish_proof.py`.
    ran_at = tstate.bos_index if tstate.bos_index is not None else tstate.direction_since
    if ran_at is None:
        return None                     # cannot locate the run; refusing on that would be a guess

    # WHICH TURN CONFIRMS THE PULLBACK, and this is the opposite of what it first looks like.
    # A pullback runs AGAINST the trend, so it is confirmed by the turn where it ENDS:
    #
    #     UPTREND   price pulls back DOWN -> that pullback ends at a LOW   (is_high False)
    #     DOWNTREND price pulls back UP   -> that pullback ends at a HIGH  (is_high True)
    #
    # so the turn we need is the OPPOSITE type to the trend. Getting this backwards refused his own
    # 2026-08-25 bearish sequence, caught by `test_choch_bearish_proof.py`: a downtrend whose
    # pullback high sat at bar 80 was read as "never pulled back" because a LOW was being looked for.
    #
    # NOT THE SAME QUESTION AS `vix1_choch`'s `p.is_high == bullish`, which looks for where the first
    # pullback BEGINS in order to close the exemption window. This looks for where one ENDS, because
    # his proof is the pullback turning back — *"when that pullback turns back down, that's the
    # proof"*. Same word, opposite turn; they are not inconsistent.
    up = tstate.direction > 0
    if not any(t.index > ran_at and t.is_high != up for t in turns):
        return ("the trend ran but has not pulled back since — it must run, pull back, then we "
                "enter")
    return None


_RUN_CANDLES = 3        # HIS number: "a run can be from 3 candles and above, then a pullback"


def market_awake(h1: list[Candle], tstate, retracement, symbol: str, look: int) -> str | None:
    """HIS FULL RULE — a quiet market must PROVE itself before we trade it.

        "Its role was to check if the momentum candle is coming from a quiet market and in that case
         we WAIT for it to run then we take a trade from a pullback and above."
        "A run can be from 3 candles and above, then a pullback."
        "A pullback can be 1 candle and above until the protected area is broken."

    AND HIS EXCEPTION, which is the half that makes this safe:

        "that quiet market should not be a pullback of 1HR trend, because sometimes pullbacks can
         lack momentum candle, then when the market corrects it comes with momentum."

    WHAT THE FIRST VERSION GOT WRONG, deployed 2026-09-04 and caught hours later. It COUNTED momentum
    candles and refused when there were none — the counting half of his rule with the waiting half
    missing. Measured on his own image-1 market: the 09:00 candle was refused, and 14:00, 17:00 and
    20:00 all traded. **The only momentum candle in the window at 14:00 was the 09:00 one this rule
    had just refused** — evidence it rejected was then used to satisfy it — and the "run" credited
    alongside it was a break of structure from 61 HOURS earlier, days before the market went quiet.

    SO THE QUESTION IS NOT "is it quiet NOW" BUT "has it proved itself SINCE it went quiet". The
    waking bar is found first, and the run and the pullback are both required strictly after it.

    NOTHING HERE IS INVENTED. The momentum candle is `is_momentum_candle` unchanged; a candle
    "carrying the trend on" is `is_bullish`/`is_bearish`, the identical test `vix1_retracement` uses
    (line 176); the pullback is the `Retracement` this path already computed. Only the sequence is
    new, and the sequence is his.
    """
    if look <= 0 or tstate is None or tstate.direction == 0:
        return None                     # no trend to measure a run against; other gates own that
    # ENOUGH REAL BARS BEFORE JUDGING — the weekend guard. 24 hours back from Monday morning is
    # mostly a CLOSED market, and a healthy Monday setup would read as dead. This platform has been
    # bitten by exactly that before: `LOOKBACK = 12` counted BARS not TIME and re-fired a Friday
    # candle 54 hours later on Sunday night. Too little history means "cannot say", never "quiet".
    span = 2 * look
    if len(h1) < span + 2:
        return None

    up = tstate.direction > 0
    n = len(h1) - 1                     # the candle being judged; never counted as evidence itself

    def momentum_at(j: int) -> bool:
        return (is_momentum_candle(h1, j, True, symbol)
                or is_momentum_candle(h1, j, False, symbol))

    mom = {j for j in range(n - span, n) if momentum_at(j)}

    # THE WAKING BAR: the most recent point at which the `look` bars behind it held no momentum
    # candle at all. Everything before it was a dead market; everything after it is the market's
    # chance to prove itself.
    woke = None
    for j in range(n - 1, n - look - 1, -1):
        if not any((j - k) in mom for k in range(1, look + 1)):
            woke = j
            break
    if woke is None:
        return None                     # alive throughout the window — nothing to prove

    # HIS EXCEPTION, CHECKED BEFORE ANYTHING IS REFUSED. A pullback inside a live 1HR trend is
    # SUPPOSED to be quiet: price is drifting back, so no candle carries the trend on and none
    # qualifies as momentum. Refusing there would kill the ordinary continuation entry — the most
    # common trade this strategy makes.
    #
    # BUT THE PULLBACK MUST ACTUALLY EXPLAIN THE SILENCE, and getting this wrong made the whole rule
    # useless for an hour. The first version asked only `retracement.active`, which is true whenever
    # ANY candle before this one failed to carry the trend on — almost always. It waved through the
    # 05 Aug 09:00 candle, which came out of **35 quiet bars** with a pullback of **2**.
    #
    # So the two lengths are compared. A pullback of 2 bars does not account for 35 hours of silence;
    # a pullback as long as the silence does, and that is a market drifting back, not a dead one.
    # **Nothing is tuned** — it is one measured length against another, both already computed.
    quiet_bars = 0
    for j in range(n - 1, -1, -1):
        if j in mom or momentum_at(j):
            break
        quiet_bars += 1
    if retracement is not None and getattr(retracement, "bars", 0) >= quiet_bars > 0:
        return None

    # THE RUN — his number: three candles or more carrying the trend on, after the waking bar.
    trend_way = is_bullish if up else is_bearish
    run = best_run = 0
    run_ended_at = None
    for j in range(woke + 1, n):
        if trend_way(h1[j]):
            run += 1
            if run >= _RUN_CANDLES:
                best_run = max(best_run, run)
                # THE **FIRST** RUN THAT QUALIFIES, and it is frozen here on purpose. Letting later
                # runs overwrite it broke his own 2026-08-25 bearish sequence: that shape is
                # run -> pull back -> turn back down -> momentum candle, so the LAST run is the
                # resumption and nothing follows it. Looking for a pullback after the last run
                # therefore always failed, and `test_choch_bearish_proof.py` went red.
                if run_ended_at is None:
                    run_ended_at = j
        else:
            run = 0
    if best_run < _RUN_CANDLES:
        return (f"the market was quiet and has not run yet — it needs {_RUN_CANDLES} candles the "
                f"trend's way, then a pullback, before a momentum candle can be trusted")

    # THE PULLBACK — one candle or more against the trend, AFTER that run. His pullback rule already
    # says one is enough; `vix1_retracement` measures it the same way and its own note records that
    # 48% of real retracements are a single candle.
    if not any(not trend_way(h1[j]) for j in range(run_ended_at + 1, n)):
        return ("the market was quiet, it has run, but it has not pulled back yet — we enter from a "
                "pullback and above, not straight off the run")
    return None


# ── IS THE MARKET CHOPPY? ─────────────────────────────────────────────────────────────────────────
#
# HIS INSTRUCTION, and it decides the whole shape of this: *"Dont use complex math, just develop
# something that detects how mixed bullish and bearish candles, different candle bodies and wicks
# and how frequently the market moves with one or 2 candles up then down in a move. No complex math,
# just pure market tracking."*
#
# So there is no ratio, no average, no statistic anywhere below. Every one of the four things he
# named is counted the same plain way: **how often does it FLIP?** A market that keeps changing its
# mind — green then red, big then small, wicky then clean, up two then down two — is choppy. A market
# that means it does the same thing several candles in a row.
#
# THE ONLY BOUNDARY USED IS "more often than not", which is not a tuned level — it is the point where
# a thing stops being occasional and becomes the market's normal behaviour. The same reasoning as the
# quiet test's boundary being zero: both come from the meaning of the words, not from fitting.

def _wicky(c) -> bool:
    """Is this candle mostly wick rather than body? No threshold — just which is bigger."""
    body = abs(c.close - c.open)
    return (c.high - c.low) - body > body


def choppiness(seg) -> dict:
    """COUNT the four things he named. Returns the counts and how many say 'mixed'.

    Nothing here is scored, weighted or averaged. Each answer is a plain count of flips against the
    number of chances to flip, and each trait is 'mixed' when it flipped more often than not.
    """
    n = len(seg)
    if n < 6:
        return {"traits": 0, "runs": 0, "short": 0, "colour": 0, "size": 0, "wick": 0, "pairs": 0}

    colour = size = wick = 0
    for i in range(1, n):
        if (seg[i].close > seg[i].open) != (seg[i - 1].close > seg[i - 1].open):
            colour += 1                                    # green <-> red
        if _wicky(seg[i]) != _wicky(seg[i - 1]):
            wick += 1                                      # wicky <-> clean
    # BIG NEXT TO SMALL — his words are *"a mixture of big bodies, small bodies"*, which is about the
    # SIZES being inconsistent, not about which way they are heading.
    #
    # THE FIRST VERSION OF THIS WAS BROKEN AND THE MEASUREMENT PROVED IT. It counted changes of
    # DIRECTION in body size ("grew, then shrank"), which is simply what candles do: it fired in
    # 13-17 of every 23 pairs in EVERY window, choppy or calm. Over 4 years **not one setup in 1,302
    # scored 0 of 4**, which is only possible if a sign is permanently on. A sign that is always true
    # carries no information and silently inflates every score.
    #
    # Now it asks the plain question instead: is this body more than DOUBLE, or less than HALF, the
    # one before it? A market building momentum prints bodies of a similar size; a choppy one throws
    # a big candle, then a stub, then a big one. Double and half are the everyday way of saying "a
    # different size", not a fitted level.
    for i in range(1, n):
        b = abs(seg[i - 1].close - seg[i - 1].open)
        c = abs(seg[i].close - seg[i].open)
        if b <= 0:
            continue
        if c > 2 * b or c * 2 < b:
            size += 1

    # HOW OFTEN IT MOVES "ONE OR 2 CANDLES UP THEN DOWN" — count the runs of same-colour candles and
    # see how many are only one or two long. A market that advances in ones and twos and then turns
    # is his choppy market; one that runs five or six the same way is grouping.
    runs, cur = [], 1
    for i in range(1, n):
        if (seg[i].close > seg[i].open) == (seg[i - 1].close > seg[i - 1].open):
            cur += 1
        else:
            runs.append(cur)
            cur = 1
    runs.append(cur)
    short = sum(1 for r in runs if r <= 2)

    traits = sum((colour * 2 > n - 1,          # colour flips more often than not
                  size * 2 > n - 1,            # big body next to small body, more often than not
                  wick * 2 > n - 1,            # wicky and clean keep alternating
                  short * 2 > len(runs)))      # most moves are only one or two candles
    return {"traits": traits, "runs": len(runs), "short": short,
            "colour": colour, "size": size, "wick": wick, "pairs": n - 1}


def market_not_choppy(h1, look: int, need: int) -> str | None:
    """His chop rule. The refusal reason, or None to allow.

    `need` is how many of the four traits must say 'mixed' before we stand aside, and it lives at the
    call site with every other number that gates a trade.
    """
    if len(h1) < look + 2:
        return None                     # not enough history to judge; refusing on that is a guess
    c = choppiness(h1[-(look + 1):])
    if c["traits"] < need:
        return None
    return (f"the market is choppy — {c['traits']} of 4 signs over the last {look} hours: colour "
            f"changed {c['colour']}x, body size {c['size']}x, wick shape {c['wick']}x, and "
            f"{c['short']} of {c['runs']} moves lasted only one or two candles")
