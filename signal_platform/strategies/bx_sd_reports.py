"""
BX-S/D — report orchestrator: the two 4H-zone-centred DM reports, run every scan independent of the
core (fresh-zone) cascade.
  ① 4H zone MITIGATION heads-up — any direction, HTF-confluence tagged.
  ② RESPECTED 4H zone RE-TEST → 1M/5M-aligned CONFIRMED entry (priority).
Each deduped once per zone via the FiredRegistry. Micro-FVG zones (< min_pips) are skipped as noise.
"""
from core.types import Candle, Signal
from strategies.bx_sd_zones import find_zones
from strategies.bx_sd_htf import htf_zone_map, htf_backing
from strategies.bx_sd_mitigation import newly_mitigated_zones, mitigation_signal
from strategies.bx_sd_retest import is_respected_retest, confirm_retest
from strategies.bx_sd_signal import build_signal

_MIN_PIPS = 3.0   # ignore micro-FVG zones


def scan_reports(symbol: str, h4: list[Candle], m5: list[Candle], m1: list[Candle],
                 htf_candles: dict[str, list[Candle]], pip: float, digits: int,
                 fired, name: str, sid: str) -> list[Signal]:
    out: list[Signal] = []
    htf_map = htf_zone_map(htf_candles)
    tmin = _MIN_PIPS * pip
    def ztime(z): return h4[z.origin_index].time

    # ① mitigation heads-ups — significant, freshly-tapped zones, once each
    for z in newly_mitigated_zones(h4):
        if (z.top - z.bottom) < tmin:
            continue
        key = f"{sid}_mit_{ztime(z)}_{z.direction}"
        if fired.has(key):
            continue
        fired.add(key)
        out.append(mitigation_signal(z, symbol, htf_backing(z, htf_map), digits, name, sid))

    # ② respected-retest → 1M/5M-aligned confirmed entry, once each
    for z in find_zones(h4):
        if (z.top - z.bottom) < tmin or not is_respected_retest(h4, z, pip):
            continue
        key = f"{sid}_retest_{ztime(z)}_{z.direction}"
        if fired.has(key):
            continue
        res = confirm_retest(z, h4, m5, m1, pip)
        if res is None:
            continue
        trig, conf, label, setup = res
        fired.add(key)
        backing = htf_backing(z, htf_map)
        tag = f", backed by {', '.join(backing)}" if backing else ""
        sig = build_signal(symbol, setup, conf, trig, pip, digits, sid, name)
        sig.technical_reasons.insert(
            0, f"🔥 RESPECTED 4H {z.direction} RE-TESTED — confirmed entry on {label}{tag}")
        sig.market_context = (f"BX-S/D PRIORITY — {symbol} respected 4H {z.direction} re-tested, "
                              f"{label} aligned{tag}, {trig.rr}R")
        out.append(sig)
    return out
