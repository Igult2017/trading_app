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


def market_awake(h1: list[Candle], symbol: str, look: int, need: int) -> str | None:
    """HIS RULE: *"a market that has gone quiet is one that has no momentum candles."*

    Counts momentum candles in the `look` bars STRICTLY BEFORE the newest one, using the entry's own
    `is_momentum_candle` unchanged. Strictly before, because the newest bar IS the momentum candle
    being judged — including it would make every market look awake by construction, which is the
    shape of bug this codebase has shipped before (a test that can never fail).

    `look` and `need` are passed in rather than defined here, so the numbers live at the call site
    where they can be seen next to everything else that gates a trade.
    """
    if look <= 0 or len(h1) < look + 2:
        return None                     # not enough history to say it is quiet; refusing would be a guess
    seen = 0
    for j in range(len(h1) - 1 - look, len(h1) - 1):
        if is_momentum_candle(h1, j, True, symbol) or is_momentum_candle(h1, j, False, symbol):
            seen += 1
            if seen >= need:
                return None
    return (f"the market has been quiet — only {seen} momentum candle(s) in the {look} hours before "
            f"this one, so this candle came out of a market with no activity")
