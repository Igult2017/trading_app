"""BX-S/D — WHAT MAKES A ZONE AN EXTREME ZONE. One definition, read by both signals.

HIS DEFINITION, settled 2026-08-25 across four messages, in his words:

    "Extreme zone is an extreme candidate that has been respected — meaning we are not guessing, we
     are waiting for the price to respect it, because we only trade when price has respected an
     extreme zone."

    "When the price is swinging up, it is the extreme above it where price has to sweep liquidity to
     tap. It can be respected or not... The extreme zones can be endless and we might not know which
     one will be respected until the price does after sweeping liquidity."

    "Extreme zone is that extreme zone, when the market is moving downwards or upwards, that will
     cause CHOCH."

So the extreme zone is THE ZONE THAT TURNS THE MARKET. Price trends one way, travels to a zone it has
never touched, sweeps the stops resting in front of it, taps it — and the reaction out of it is what
breaks structure the other way. That break is the change of character.

TWO STAGES, AND THE SECOND ONE IS PROOF RATHER THAN PREDICTION:

    CANDIDATE  an untouched zone lying against the swing, with liquidity resting in front of it
    EXTREME    a candidate price then RESPECTED — tapped it and stayed clear for REACT_BARS bars

    "We are not guessing, we are waiting for the price to respect it."

THERE IS NO BOUND ON HOW FAR OUT A CANDIDATE MAY SIT, and this is deliberate. *"The extreme zones can
be endless."* Three bounds were proposed — beyond the last swing point, beyond the next liquidity
pool, within the current leg only — and he rejected all three. He mentioned Daily/Weekly/Monthly zones
only to convey HOW FAR these can sit, never as a requirement; D/W/M remain confluence and must never
gate (his rule, and see `bx_sd_setup`'s note on `htf_backing`). DO NOT ADD A DISTANCE LIMIT, A
LOOKBACK WINDOW OR A CUT-OFF HERE.

WHAT THIS REPLACED. Both signals tested `respected_at is not None` and NOTHING ELSE, against the whole
zone book — `bx_sd.py` loops every zone in `build()`'s output. So a demand zone sitting BEHIND price
in a rally qualified as an "extreme" identically to a supply zone standing in front of it, and no
sweep was ever required for signal 1. That is why cards arrived for zones he could not see on the
chart. Respect was never the wrong test; it simply had no candidate set to select FROM.

THE THREE OUTCOMES, and none of them is "decisional":
    respected           -> it is the extreme, and its reaction is the trade
    tapped and broken   -> it disappears (the registry drops it from `live`)
    never reached       -> still a candidate, reconsidered next time

    "Extreme zone candidates cannot be decisional zones whether one won or not... if there are others
     on top of it untouched, they are just extreme zones that have not been tapped."

`decisional` is a separate, CREATION-based judgement and does not live here — a zone is decisional
when its own reaction produced a FAKE change of character (`bx_sd_lineage.choch_verdict`). His rule:
*"Decisional zone does not become decisional because another zone won, it is based on its creation."*
"""
from core.types import Candle
from shared.mtf_utils import closed_only
from shared.trend_detector import Trend, detect
from strategies.bx_sd_registry import LIQ_WINDOW, MarkedZone


def swing_at(bars: list[Candle], upto_i: int) -> str:
    """Which way was the market swinging as of bar `upto_i`? "up" | "down" | "" (ranging).

    CLOSED BARS ONLY, AND BOUNDED AT `upto_i`. The whole point of the candidate test is that it
    describes the market AS PRICE ARRIVED at the zone, not as it stands now — reading today's trend
    would let a zone become a candidate retroactively because of what happened after it was tapped.
    Same discipline as `_broke_structure` in the registry: bounded, never the finished picture.

    `detect` is the generic shared trend reader (HH/HL = up, LH/LL = down, RANGING when ambiguous) —
    the same one `bx_sd_setup.regime` uses, so BX has one answer to "which way is it swinging" rather
    than two that can disagree.
    """
    seg = closed_only(bars[:upto_i + 1])
    if len(seg) < 10:
        return ""                       # `detect` needs 10 bars; below that we genuinely do not know
    t = detect(seg)
    return "up" if t == Trend.UPTREND else "down" if t == Trend.DOWNTREND else ""


def against_the_swing(direction: str, swing: str) -> bool:
    """Does this zone stand AGAINST the swing — the side that would turn it?

    His rule: *"When the price is swinging up, it is the extreme above it."* Price swinging up runs
    into SUPPLY; price swinging down runs into DEMAND. A zone on the same side as the swing is behind
    price, not in front of it, and cannot be what turns the market.

    He corrected his own wording on this rather than leave it ambiguous: *"I made an error here, i
    would have said supply zone"* — on the sentence that had read "zones above in case of demand
    zones when price is swinging HH and HLs".
    """
    if swing == "up":
        return direction == "supply"
    if swing == "down":
        return direction == "demand"
    return False                        # ranging — see `extreme_candidate_at`


def beyond_price(z: MarkedZone, bar: Candle, swing: str) -> bool:
    """Was the zone still IN FRONT of price on its approach — above it in a rally, below in a sell-off?

    Judged from the bar's CLOSE, not its high/low: the wick that reaches into the zone is the tap
    itself, so measuring against it would answer "was price touching the zone" (always true at a tap)
    instead of "was the zone still ahead of price".
    """
    if swing == "up":
        return z.bottom >= bar.close
    if swing == "down":
        return z.top <= bar.close
    return False


def extreme_candidate_at(z: MarkedZone, bars: list[Candle], pools, tap_i: int,
                         zones: list[MarkedZone] | None = None) -> bool:
    """Was `z` an EXTREME CANDIDATE at the moment price tapped it, on bar `tap_i`?

    Four things, all his, none of them a measurement:

      * UNTOUCHED until this tap. True by construction — `mitigated_at` is stamped on the FIRST tap
        and never moved — so this is asserted rather than re-derived, and only guards a caller passing
        a later visit.
      * AGAINST THE SWING — supply while price swings up, demand while it swings down.
      * STILL IN FRONT of price on the approach.
      * LIQUIDITY SWEPT to reach it. *"it is the extreme above it where price HAS TO SWEEP LIQUIDITY
        to tap."* Reuses `swept_within` over the `LIQ_WINDOW` bars leading to the tap — the same
        window and the same function the change-of-character verdict uses
        (`bx_sd_lineage.swept_before_tap`), never a second definition of "swept".

    RANGING RETURNS FALSE, and this is the one thing his description does not cover. With no swing
    there is no "above it" to point at, so no NEW candidate opens. A zone that already earned
    `respected_at` while the market was trending keeps it — this only decides whether a fresh tap
    opens a candidate. Flagged in the architecture doc as open rather than guessed at.
    """
    from strategies.bx_sd_liquidity import swept_within

    if not (0 <= tap_i < len(bars)):
        return False
    if z.mitigated_at is not None and bars[tap_i].time > z.mitigated_at:
        return False                    # a return visit, not the tap that spent the zone

    swing = swing_at(bars, tap_i)
    if not swing:
        return False                    # ranging — no direction to be extreme against
    if not against_the_swing(z.direction, swing):
        return False
    if not beyond_price(z, bars[tap_i], swing):
        return False

    # The stops price had to take out to get here. `side` is the side of the book being hunted: a
    # rally into supply runs BUY stops, a sell-off into demand runs SELL stops.
    side = "buy" if swing == "up" else "sell"
    if swept_within(pools, bars, side, max(0, tap_i - LIQ_WINDOW), tap_i):
        return True

    # A BROKEN ZONE IS ITSELF THE LIQUIDITY (his rule, 2026-08-22):
    #
    #     "once the first one is broken, the next one qualifies whether liquidity is swept or not,
    #      because remember a zone itself is liquidity — so where there is no liquidity the zone
    #      becomes liquidity and then the next zone is respected."
    #
    # WITHOUT THIS ARM THE RULE WOULD HAVE BEEN SILENTLY REPEALED. `choch_verdict` has carried the
    # same OR since 2026-08-22, but it only reaches its sweep test AFTER `parent_of` returns a zone —
    # and `parent_of` now asks this function first. A sweep-only test here would refuse the parent
    # before his exception could ever be applied, so a zone that qualified purely by breaking the one
    # below it would stop qualifying anywhere. Found while rebuilding a fixture, not by reading.
    if zones is not None:
        from strategies.bx_sd_lineage import same_side_zone_broken_before
        return same_side_zone_broken_before(z, zones)
    return False


def is_extreme(z: MarkedZone, bars: list[Candle], pools,
               zones: list[MarkedZone] | None = None) -> bool:
    """Is this an EXTREME ZONE — a candidate that price has RESPECTED?

    His definition in one line: *"extreme zone is an extreme candidate that has been respected."*

    Respect is the proof and it is already recorded: `respected_at` is stamped when price tapped the
    zone and then stayed clear of it for `REACT_BARS` consecutive closed bars. This function adds the
    half that was missing — that the zone was a CANDIDATE when price arrived.

    A zone never tapped cannot be an extreme yet. It is not rejected forever: it stays untouched in
    the book, and *"at some point the price will come back to tap them and then we consider them
    again."*
    """
    if z.respected_at is None or z.mitigated_at is None:
        return False
    tap_i = next((i for i, c in enumerate(bars) if c.time == z.mitigated_at), None)
    if tap_i is None:
        return False                    # older than the window handed to us — cannot judge it
    return extreme_candidate_at(z, bars, pools, tap_i, zones)
