"""
BX-S/D — report orchestrator: the 4H-zone-centred outputs, run every scan alongside the fresh-zone
cascade (bx_sd.analyze).
  ① 4H zone MITIGATION heads-up (DM) — a fresh zone just first-tapped; any direction, HTF-tagged.
  ② RETEST (channel) — a MITIGATED but still-valid pro-trend 4H zone RE-TAPPED now, confirmed on
     1M/5M with MTF confluence (B/A ONLY — a mitigated zone must EARN its re-entry; fresh zones are
     the core cascade's job).
  ③ CONTINUATION (channel) — a FRESH 4H FVG tapped & holding, confirmed on 1M/5M, graded C/B/A.
Every producer works from BOOK-VALID zones (bx_sd_validity: IFC + broke structure + liquidity grab).

Dedup is DELIVERY-CONFIRMED (at-least-once): each signal is stamped with its dedup_key, committed by
the dispatcher only AFTER a successful send, so a failed send re-fires next scan instead of being lost.
Micro-FVG zones (< min_pips) are skipped as noise.
"""
from core.types import Candle, Signal
from core import delivery_ledger
from strategies.bx_sd_zones import find_zones
from strategies.bx_sd_validity import valid_zones
from strategies.bx_sd_structure import map_structure
from strategies.bx_sd_htf import htf_zone_map, htf_backing
from strategies.bx_sd_mitigation import newly_mitigated_zones, mitigation_signal
from strategies.bx_sd_retest import retapped_now, fvg_zone, is_fvg_tap, _setup_for_zone
from strategies.bx_sd_continuation import confirm_continuation
from strategies.bx_sd_confirm import confirm_grade
from strategies.bx_sd_signal import build_signal

_MIN_PIPS = 3.0   # ignore micro-FVG zones


def scan_reports(symbol: str, h4: list[Candle], analysis_tfs: list, entry_tf: list[Candle],
                 m5: list[Candle], m1: list[Candle], htf_candles: dict, pip: float, digits: int,
                 name: str, sid: str) -> list[Signal]:
    out: list[Signal] = []
    dm_id   = f"{sid}_watch"   # the mitigation heads-up is a heads-up, not a signal -> admin DM
    htf_map = htf_zone_map(htf_candles)
    tmin = _MIN_PIPS * pip
    def ztime(z): return h4[z.ifc_index].time
    zones = valid_zones(h4, find_zones(h4), pip)          # the book's 3 factors — one definition
    pro   = map_structure(h4).pro_trend()                 # retest is pro-trend only
    pdir  = None if pro is None else ("demand" if pro == "up" else "supply")

    # ① mitigation heads-ups — significant, freshly-tapped zones, once each (on confirmed delivery)
    for z in newly_mitigated_zones(h4, zones=zones):
        if (z.top - z.bottom) < tmin:
            continue
        key = f"{dm_id}_mit_{ztime(z)}_{z.direction}"
        if delivery_ledger.is_delivered(key):
            continue
        sig = mitigation_signal(z, symbol, htf_backing(z, htf_map), digits, name, dm_id)
        sig.dedup_key = key                 # committed only when the DM actually lands
        out.append(sig)

    # ② RETEST — a MITIGATED but valid pro-trend 4H zone re-tapped now, 1M/5M-confirmed at B/A only.
    for z in zones:
        if z.direction != pdir or (z.top - z.bottom) < tmin or not retapped_now(h4, z):
            continue
        key = f"{sid}_retest_{ztime(z)}_{z.direction}"
        if delivery_ledger.is_delivered(key):
            continue
        setup = _setup_for_zone(h4, z, pip)
        res = confirm_grade(setup, h4, analysis_tfs, entry_tf, htf_map, pip, min_grade="B")
        if res is None:                     # no 1M/5M confirmation, or below B (bare-C retest dropped)
            continue
        conf, trig, grade = res
        sig = build_signal(symbol, setup, conf, trig, pip, digits, sid, name)
        sig.technical_reasons.insert(
            0, f"🔁 RETEST [{grade}] — mitigated 4H {z.direction} zone respected again, MTF-confirmed")
        sig.market_context = (f"BX-S/D RETEST [{grade}] — {symbol} mitigated 4H {z.direction} re-tapped, "
                              f"{grade}-grade MTF, {trig.rr}R")
        sig.dedup_key = key
        out.append(sig)

    # ③ CONTINUATION — a FRESH 4H FVG tapped & holding, confirmed on 1M/5M, graded C/B/A.
    for z in zones:
        if (z.top - z.bottom) < tmin:
            continue
        fvg = fvg_zone(h4, z)
        if fvg is None or not is_fvg_tap(h4, z, fvg):
            continue
        key = f"{sid}_cont_{ztime(z)}_{z.direction}"
        if delivery_ledger.is_delivered(key):
            continue
        res = confirm_continuation(fvg, z, h4, m5, m1, analysis_tfs, htf_map, pip)
        if res is None:
            continue
        trig, conf, label, setup = res
        sig = build_signal(symbol, setup, conf, trig, pip, digits, sid, name)
        sig.technical_reasons.insert(
            0, f"➡️ CONTINUATION [{conf.grade}] — 4H {z.direction} FVG tapped & holding, confirmed on {label}")
        sig.market_context = (f"BX-S/D CONTINUATION [{conf.grade}] — {symbol} tapped the 4H {z.direction} "
                              f"FVG and continued, {trig.rr}R")
        sig.dedup_key = key
        out.append(sig)
    return out
