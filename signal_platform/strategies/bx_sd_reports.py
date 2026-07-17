"""
BX-S/D — report orchestrator: the two 4H-zone-centred DM reports, run every scan independent of the
core (fresh-zone) cascade.
  ① 4H zone MITIGATION heads-up — any direction, HTF-confluence tagged.
  ② RESPECTED 4H zone RE-TEST → 1M/5M-aligned CONFIRMED entry (priority).
Every producer works from BOOK-VALID zones only (bx_sd_validity: IFC + broke structure + liquidity
grabbed). A candle next to a gap is not a zone, so it is not worth a DM either.

Dedup is DELIVERY-CONFIRMED (at-least-once): each signal is stamped with its dedup_key but the key is
only committed to the shared delivery ledger by the dispatcher AFTER a successful DM. A send that
fails — or a crash before it — leaves the key uncommitted, so the report re-fires next scan instead of
being lost. Micro-FVG zones (< min_pips) are skipped as noise.
"""
from core.types import Candle, Signal
from core import delivery_ledger
from strategies.bx_sd_zones import find_zones
from strategies.bx_sd_validity import valid_zones
from strategies.bx_sd_htf import htf_zone_map, htf_backing
from strategies.bx_sd_mitigation import newly_mitigated_zones, mitigation_signal
from strategies.bx_sd_retest import is_respected_retest, confirm_retest, fvg_zone, is_fvg_tap
from strategies.bx_sd_continuation import confirm_continuation
from strategies.bx_sd_signal import build_signal

_MIN_PIPS = 3.0   # ignore micro-FVG zones


def scan_reports(symbol: str, h4: list[Candle], m5: list[Candle], m1: list[Candle],
                 htf_candles: dict[str, list[Candle]], pip: float, digits: int,
                 name: str, sid: str) -> list[Signal]:
    out: list[Signal] = []
    dm_id   = f"{sid}_watch"   # the mitigation heads-up is a heads-up, not a signal -> admin DM
    htf_map = htf_zone_map(htf_candles)
    tmin = _MIN_PIPS * pip
    # Key on the IFC, not the origin: there is exactly ONE zone per IFC, so the IFC identifies a zone
    # uniquely. origin_index does NOT — a wick zone sits ON its impulse (origin == ifc) while the next
    # IFC's ordinary zone sits on that same candle (origin == ifc-1), so the two collide and one would
    # be silently suppressed as already-delivered.
    def ztime(z): return h4[z.ifc_index].time
    # The book's 3 factors. find_zones only proves the IFC — a candidate next to a gap is not a zone
    # (p26/p27/p29), and we must not DM about zones the entry cascade would never touch.
    zones = valid_zones(h4, find_zones(h4), pip)

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

    # ② respected-retest → 1M/5M-aligned confirmed entry, once each (on confirmed delivery)
    for z in zones:
        if (z.top - z.bottom) < tmin or not is_respected_retest(h4, z, pip):
            continue
        key = f"{sid}_retest_{ztime(z)}_{z.direction}"
        if delivery_ledger.is_delivered(key):
            continue
        res = confirm_retest(z, h4, m5, m1, pip)
        if res is None:
            continue
        trig, conf, label, setup = res
        backing = htf_backing(z, htf_map)
        tag = f", backed by {', '.join(backing)}" if backing else ""
        sig = build_signal(symbol, setup, conf, trig, pip, digits, sid, name)
        sig.technical_reasons.insert(
            0, f"🔥 RESPECTED 4H {z.direction} RE-TESTED — confirmed entry on {label}{tag}")
        sig.market_context = (f"BX-S/D PRIORITY — {symbol} respected 4H {z.direction} re-tested, "
                              f"{label} aligned{tag}, {trig.rr}R")
        sig.dedup_key = key                 # committed only when the DM actually lands
        out.append(sig)

    # ③ continuation entry — shallow FVG-tap-and-continue (book's continuation entry), once each
    for z in zones:
        if (z.top - z.bottom) < tmin:
            continue
        fvg = fvg_zone(h4, z)
        if fvg is None or not is_fvg_tap(h4, z, fvg):
            continue
        key = f"{sid}_cont_{ztime(z)}_{z.direction}"
        if delivery_ledger.is_delivered(key):
            continue
        res = confirm_continuation(fvg, h4, m5, m1, pip)   # trend-BOS/flip confirm off the FVG (NOT a reversal CHoCH)
        if res is None:
            continue
        trig, conf, label, setup = res
        backing = htf_backing(z, htf_map)
        tag = f", backed by {', '.join(backing)}" if backing else ""
        sig = build_signal(symbol, setup, conf, trig, pip, digits, sid, name)
        sig.technical_reasons.insert(
            0, f"➡️ CONTINUATION — 4H {z.direction} FVG tapped & holding, confirmed on {label}{tag}")
        sig.market_context = (f"BX-S/D CONTINUATION — {symbol} tapped the 4H {z.direction} FVG and "
                              f"continued (no full retest), {label} aligned{tag}, {trig.rr}R")
        sig.dedup_key = key
        out.append(sig)
    return out
