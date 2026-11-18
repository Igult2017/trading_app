"""PIX — ORDER FLOW AT THE ZONE: who is buying, who is selling, and does price agree (his rules, 18 Nov 2026).

His words:
  * footprint *"to find volume delta difference and to know whether the price is going to respect those zones or not.
    This is used when price has just tapped that zone."*
  * *"Absorption means there is an imbalance in delta supporting that the one should be respected but we can see the
    price moving to break past the zone… we will not enter the trade."*
  * CVD: divergence (CVD changing direction near the zone) → likely to respect; convergence (CVD supporting the move into
    the zone) → may not respect.
  * *"Our entry will also follow the same procedure in 5m… Divergence and volume footprint are likely to be more accurate
    in 1M TF."* → the same verdict runs on 5M AND 1M, and both must say GO.

THE INPUT. Broker candles (CLOSED only) and, per candle open time, the volume bought and sold by aggressive traders
(`flows[time] = (buy, sell)`): Bitcoin from Binance's own reported taker volumes, gold estimated from our price stream's
up/down ticks. A candle with no flow figure makes the verdict UNKNOWN, and UNKNOWN refuses — no order flow, no trade.

WHAT EACH WORD MEANS HERE (the numbers are mine, named so he can change them):
  * delta = buy − sell; imbalance = delta / (buy + sell), from −1 (all selling) to +1 (all buying).
  * INITIATION — the candle that closes back out of the zone has its delta on the trade's side (imbalance ≥ INIT_MIN).
  * ABSORPTION — a candle during the visit whose delta is strongly on the trade's side (imbalance ≥ ABSORB_MIN) and which
    still closed AGAINST the trade: the side that should win was pushing and price went the other way → REFUSE.
  * CVD (the running total of delta) over the approach into the zone and the visit, split into an earlier and a later
    half. Price made a new extreme into the zone in the later half (a lower low at demand) and CVD did NOT → DIVERGENCE
    (go). CVD made that new extreme too → CONVERGENCE (refuse). No new price extreme → neutral (allowed).
"""
from __future__ import annotations

from dataclasses import dataclass, field

from core.types import Candle
from strategies.pix_candles import closed_only

INIT_MIN   = 0.10    # the respect candle's imbalance on the trade's side, at least
ABSORB_MIN = 0.25    # a visit candle this one-sided on the trade's side that closes against it = absorption
APPROACH   = 12      # candles before the tap that make up "the approach into the zone"

GO, REFUSE, UNKNOWN = "GO", "REFUSE", "UNKNOWN"


@dataclass
class Verdict:
    kind:    str                       # GO | REFUSE | UNKNOWN
    reasons: list[str] = field(default_factory=list)

    @property
    def go(self) -> bool:
        return self.kind == GO


def imbalance(buy: float, sell: float) -> float:
    tot = buy + sell
    return (buy - sell) / tot if tot > 0 else 0.0


def verdict(candles: list[Candle], flows: dict[int, tuple[float, float]], bull: bool, tap_time: int,
            tf: str) -> Verdict:
    """Order-flow verdict for a visit that began at `tap_time`, on one timeframe (`tf` only labels the reasons)."""
    c = closed_only(candles)
    visit = [x for x in c if x.time >= tap_time]
    before = [x for x in c if x.time < tap_time][-APPROACH:]
    if not visit or len(before) < APPROACH // 2:
        return Verdict(UNKNOWN, [f"{tf}: not enough candles around the tap"])
    span = before + visit
    missing = [x.time for x in span if x.time not in flows]
    if missing:
        return Verdict(UNKNOWN, [f"{tf}: no buy/sell figures for {len(missing)} of {len(span)} candles"])
    side = 1 if bull else -1
    reasons: list[str] = []

    for x in visit:                                                  # ABSORPTION
        imb = imbalance(*flows[x.time]) * side
        against = (x.close < x.open) if bull else (x.close > x.open)
        if imb >= ABSORB_MIN and against:
            return Verdict(REFUSE, [f"{tf} ABSORPTION: {'buyers' if bull else 'sellers'} {abs(imb):.0%} one-sided "
                                    f"but the candle closed {'down' if bull else 'up'} — the zone is being absorbed"])

    last = visit[-1]                                                 # INITIATION
    imb = imbalance(*flows[last.time]) * side
    if imb < INIT_MIN:
        return Verdict(REFUSE, [f"{tf}: the candle leaving the zone had {'buying' if bull else 'selling'} of only "
                                f"{imb:+.0%} (needs {INIT_MIN:.0%}) — no initiation"])
    reasons.append(f"{tf} INITIATION: {'buyers' if bull else 'sellers'} {imb:.0%} one-sided as price left the zone")

    cvd, run = [], 0.0                                               # CVD DIVERGENCE / CONVERGENCE
    for x in span:
        b, s = flows[x.time]
        run += b - s
        cvd.append(run)
    h = len(span) // 2
    if bull:
        new_price = min(x.low for x in span[h:]) < min(x.low for x in span[:h])
        new_cvd = min(cvd[h:]) < min(cvd[:h])
    else:
        new_price = max(x.high for x in span[h:]) > max(x.high for x in span[:h])
        new_cvd = max(cvd[h:]) > max(cvd[:h])
    if new_price and new_cvd:
        return Verdict(REFUSE, reasons + [f"{tf} CVD CONVERGENCE: CVD followed price to a new "
                                          f"{'low' if bull else 'high'} into the zone — may not respect"])
    reasons.append(f"{tf} CVD DIVERGENCE: price made a new {'low' if bull else 'high'} into the zone, CVD did not"
                   if new_price else f"{tf} CVD neutral: no new {'low' if bull else 'high'} into the zone")
    return Verdict(GO, reasons)
