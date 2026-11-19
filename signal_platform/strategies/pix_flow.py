"""PIX — ORDER FLOW AT THE ZONE: who is buying, who is selling, and does price agree.

His words:
  * *"Absorption means there is an imbalance in delta supporting that the one should be respected but we can see the
    price moving to break past the zone… we will not enter the trade."* (18 Nov) → ABSORPTION REFUSES the trade.
  * *"You can also confirm this with divergence and candle volume footprint delta which is the different between the
    number of market buys and sells"*, and on whether they gate: *"Both must agree but if they don't indicate so in the
    signal card"* (19 Nov) → DIVERGENCE and DELTA CONFIRM; they never stop a signal, the card says whether they agree.
  * CVD is used ONLY for divergence / convergence (his correction, 18 Nov) — never for absorption.

THE INPUT. Broker candles (CLOSED only) and, per candle open time, the volume bought and sold by aggressive traders
(`flows[time] = (buy, sell)`): Bitcoin from Binance's own reported taker volumes; broker-streamed markets (gold, and any
forex pair) estimated from our price stream's up/down ticks (`pix_tickflow`). `prints` = the per-price footprint.

WHAT EACH WORD MEANS HERE:
  * delta = buy − sell; imbalance = delta / (buy + sell), from −1 (all selling) to +1 (all buying).
  * ABSORPTION — the side that should win was pushing and price went the other way. (a) a visit candle whose imbalance is
    ≥ ABSORB_MIN on the trade's side but closed AGAINST the trade; (b) the FOOTPRINT: stacked buying (at demand) at
    prices the candle then closed BELOW — mirrored for supply. Checked on every visit candle that has figures.
  * DIVERGENCE — over the approach into the zone + the visit, split in halves: price made a new extreme into the zone in
    the later half and CVD did NOT (divergence = agrees); CVD did too (convergence = disagrees); no new extreme (neutral
    = no divergence, so it does not agree either — "both must agree").
  * DELTA — the reaction candles' delta added up; it agrees when it is on the trade's side (buying for a buy).
  * VOLUME — the reaction's average volume vs the `VOL_AVG_N` candles before the touch: shown, never a gate.
"""
from __future__ import annotations

from dataclasses import dataclass

from core.types import Candle
from strategies.pix_candles import closed_only
from strategies.pix_footprint import build as footprint

ABSORB_MIN = 0.25    # a visit candle this one-sided on the trade's side that closes against it = absorption
APPROACH   = 12      # candles before the touch that make up "the approach into the zone"
VOL_AVG_N  = 20      # the reaction's volume is compared with the average of this many candles before the touch


def imbalance(buy: float, sell: float) -> float:
    tot = buy + sell
    return (buy - sell) / tot if tot > 0 else 0.0


def cvd_state(span: list[Candle], flows: dict[int, tuple[float, float]], bull: bool) -> str:
    """"divergence" | "convergence" | "neutral" over the approach + visit, split in halves."""
    cvd, run = [], 0.0
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
    if not new_price:
        return "neutral"
    return "convergence" if new_cvd else "divergence"


def absorbed(candles: list[Candle], flows: dict, bull: bool, from_time: int, tf: str,
             prints: dict | None = None) -> str | None:
    """The reason when a visit candle (open time ≥ `from_time`) shows absorption, else None."""
    for x in closed_only(candles):
        if x.time < from_time:
            continue
        against = (x.close < x.open) if bull else (x.close > x.open)
        if x.time in flows and against and imbalance(*flows[x.time]) * (1 if bull else -1) >= ABSORB_MIN:
            return (f"{tf} ABSORPTION: {'buyers' if bull else 'sellers'} "
                    f"{abs(imbalance(*flows[x.time])):.0%} one-sided but the candle closed {'down' if bull else 'up'}")
        fp = footprint(prints[x.time]) if prints and x.time in prints else None
        if fp:
            beaten = [(a, b) for a, b in (fp.buy_stacks if bull else fp.sell_stacks)
                      if (x.close < a if bull else x.close > b)]
            if beaten:
                a, b = beaten[0]
                return (f"{tf} ABSORPTION (footprint): {'buyers' if bull else 'sellers'} stacked at {a:.5g}–{b:.5g} "
                        f"but the candle closed {'below' if bull else 'above'} them")
    return None


@dataclass
class Confirm:
    source:     str
    divergence: str | None     # divergence | convergence | neutral | None (no figures)
    delta:      float | None   # the reaction's imbalance ON THE TRADE'S SIDE, −1..+1; None = no figures
    volume_x:   float | None   # reaction volume ÷ the average before the touch; None = not measurable

    @property
    def agree(self) -> bool:
        return self.divergence == "divergence" and self.delta is not None and self.delta > 0

    def line(self, bull: bool) -> str:
        tag = f" ({self.source})" if self.source else ""
        if self.divergence is None and self.delta is None:
            return f"Order flow not available yet{tag} — divergence and delta not checked"
        div = {"divergence": "CVD divergence ✓", "convergence": "CVD convergence ✗",
               "neutral": "no CVD divergence ✗", None: "divergence not available"}[self.divergence]
        side = "buying" if bull else "selling"
        dl = ("delta not available" if self.delta is None else
              f"delta {self.delta:+.0%} {side} on the reaction {'✓' if self.delta > 0 else '✗'}")
        head = "Order flow CONFIRMS" if self.agree else "⚠ Order flow does NOT agree"
        return f"{head}{tag}: {div}, {dl}"


def confirm(m1: list[Candle], flows: dict, bull: bool, touch_at: int, reaction_times: list[int],
            source: str = "") -> Confirm:
    """Divergence + reaction delta on the 1M (*"more accurate in 1M TF"*). Missing figures → None, never a guess."""
    c = closed_only(m1)
    visit = [x for x in c if x.time >= touch_at]
    before = [x for x in c if x.time < touch_at][-APPROACH:]
    span = before + visit
    div = None
    if visit and len(before) >= APPROACH // 2 and all(x.time in flows for x in span):
        div = cvd_state(span, flows, bull)
    delta = vol_x = None
    if reaction_times and all(t in flows for t in reaction_times):
        b = sum(flows[t][0] for t in reaction_times)
        s = sum(flows[t][1] for t in reaction_times)
        delta = imbalance(b, s) * (1 if bull else -1)
        prior = [flows[x.time] for x in c if x.time < touch_at and x.time in flows]
        prior = prior[max(0, len(prior) - VOL_AVG_N):]
        avg = sum(p + q for p, q in prior) / len(prior) if prior else 0.0
        vol_x = ((b + s) / len(reaction_times)) / avg if avg > 0 else None
    return Confirm(source, div, delta, vol_x)
