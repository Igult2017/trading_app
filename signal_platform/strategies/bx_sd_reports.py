"""
BX-S/D — the 4H-zone reports, driven by the ZONE BOOK (bx_sd_registry).

  ① MITIGATION heads-up (DM) — a marked zone just moved unmitigated → mitigated (price tapped it).
  ② RETEST (channel) — a zone that was mitigated and then RESPECTED is re-tapped now, 1M/5M-confirmed
     at B/A only. A mitigated zone must EARN its re-entry; fresh zones are the core cascade's job.

Both read LIFECYCLE STATE off zones that were marked once when they qualified. Nothing here re-derives
a zone, recomputes a tap, or re-tests validity — that is what let a candle beside a gap masquerade as a
zone (27 Jul: a break at lag −1, before its own imbalance existed).

The FVG-continuation path was REMOVED 2026-07-27. It entered off an imbalance rather than a zone, by
wrapping a raw FVG in a Zone (`fvg_zone`). The user's instruction is that BX trades supply and demand
zones only — an imbalance qualifies a zone, it is never a level to trade.

Dedup is DELIVERY-CONFIRMED (at-least-once): each signal carries its dedup_key, committed by the
dispatcher only AFTER a successful send, so a failed send re-fires next scan instead of being lost.
Keys use the zone's IFC TIME — stable identity, unlike a window index.
"""
from core.types import Candle, Signal
from core import delivery_ledger
from shared.mtf_utils import closed_only
from strategies.bx_sd_registry import build, to_zone
from strategies.bx_sd_htf import htf_zone_map, htf_backing
from strategies.bx_sd_mitigation import mitigation_signal
from strategies.bx_sd_retest import _setup_for_zone
from strategies.bx_sd_confirm import confirm_grade
from strategies.bx_sd_signal import build_signal

_MIN_PIPS = 3.0   # ignore micro zones — same noise floor the cascade applies
_RECENT   = 6     # "now" = within the last N 4H bars


def scan_reports(symbol: str, h4: list[Candle], analysis_tfs: list, entry_tf: list[Candle],
                 m5: list[Candle], m1: list[Candle], htf_candles: dict, pip: float, digits: int,
                 name: str, sid: str, book=None) -> list[Signal]:
    out: list[Signal] = []
    dm_id   = f"{sid}_watch"   # a heads-up is not a signal -> admin DM, never the channel
    htf_map = htf_zone_map(htf_candles)
    tmin    = _MIN_PIPS * pip
    bars    = closed_only(h4)
    if len(bars) < _RECENT:
        return out
    # built once per scan by bx_sd.analyze; the fallback keeps this callable standalone
    marked  = build(h4, pip) if book is None else book
    cut     = bars[-_RECENT].time

    # ① MITIGATION heads-up — the zone was tapped for the first time, recently.
    for mz in marked:
        if mz.state != "mitigated" or mz.mitigated_at is None or mz.mitigated_at < cut:
            continue
        if (mz.top - mz.bottom) < tmin:
            continue
        key = f"{dm_id}_mit_{mz.ifc_time}_{mz.direction}"
        if delivery_ledger.is_delivered(key):
            continue
        z = to_zone(mz, bars)
        if z is None:
            continue
        sig = mitigation_signal(z, symbol, htf_backing(z, htf_map), digits, name, dm_id)
        sig.dedup_key = key                 # committed only when the DM actually lands
        out.append(sig)

    # ② RETEST — the zone was mitigated, then RESPECTED (price reacted a full zone-height away), and
    #    price is back inside it now. The respect is a lifecycle fact, not something re-derived here.
    for mz in marked:
        if mz.state != "respected" or (mz.top - mz.bottom) < tmin:
            continue
        if not any(mz.tapped_by(c) for c in bars[-_RECENT:]):
            continue                        # respected, but price is not back at it right now
        key = f"{sid}_retest_{mz.ifc_time}_{mz.direction}"
        if delivery_ledger.is_delivered(key):
            continue
        z = to_zone(mz, bars)
        if z is None:
            continue
        setup = _setup_for_zone(h4, z, pip, book=marked)
        res = confirm_grade(setup, h4, analysis_tfs, entry_tf, htf_map, pip, min_grade="B")
        if res is None:                     # no 1M/5M confirmation, or below B
            continue
        conf, trig, grade = res
        sig = build_signal(symbol, setup, conf, trig, pip, digits, sid, name)
        sig.technical_reasons.insert(
            0, f"🔁 RETEST [{grade}] — mitigated 4H {z.direction} zone respected, re-tapped, MTF-confirmed")
        sig.market_context = (f"BX-S/D RETEST [{grade}] — {symbol} mitigated 4H {z.direction} re-tapped, "
                              f"{grade}-grade MTF, {trig.rr}R")
        sig.dedup_key = key
        out.append(sig)
    return out
