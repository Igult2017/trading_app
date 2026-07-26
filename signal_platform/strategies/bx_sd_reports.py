"""
BX-S/D — report orchestrator: the 4H-zone-centred outputs, run every scan alongside the fresh-zone
cascade (bx_sd.analyze).
  ① 4H zone MITIGATION heads-up (DM) — a fresh zone just first-tapped; any direction, HTF-tagged.
  ② RETEST (channel) — a MITIGATED but still-valid pro-trend 4H zone RE-TAPPED now, confirmed on
     1M/5M with MTF confluence (B/A ONLY — a mitigated zone must EARN its re-entry; fresh zones are
     the core cascade's job).
  ③ FVG CONTINUATION (channel) — an FVG whose 4H zone beneath is STILL UNMITIGATED, tapped &
     holding, 1M/5M-confirmed. The card says so: this is a bet price continues from the
     imbalance and never returns for the zone. BX trades ZONES; the FVG only qualifies one.
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
from strategies.bx_sd_setup import _first_tap, level_pre_mitigated
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

    # ③ CONTINUATION — an FVG whose 4H zone beneath is STILL FRESH, tapped & holding, 1M/5M-confirmed.
    #
    # BX TRADES ZONES, NOT FVGs. The book is explicit that an imbalance is "more of an ADDITIONAL
    # CONFLUENCE and reference point of where price may revisit" (Ch.3) — it qualifies a zone, it does
    # not decide a trade. This path exists only for the case the book describes elsewhere: price taps
    # the imbalance in FRONT of an untouched zone and continues, never coming back for the zone.
    #
    # That premise requires the zone beneath to be UNMITIGATED. Until 2026-07-26 nothing checked it:
    # the loop ran over every valid zone, drained ones included, and the FVG tap was the sole trigger —
    # which is what made BX look like it was trading FVGs.
    for z in zones:
        if (z.top - z.bottom) < tmin:
            continue
        # (a) THE ZONE BENEATH MUST BE FRESH. If price has already traded into it, "it may never reach
        #     the zone" is simply false — it already did — and the retest/main path owns that case.
        if _first_tap(h4, z) is not None:
            continue
        fvg = fvg_zone(h4, z)
        if fvg is None or not is_fvg_tap(h4, z, fvg):
            continue
        # (b) FRESHNESS IS LEVEL-AWARE. is_fvg_tap scans forward from the FVG's own ifc_index+2, so an
        #     FVG sitting on a level older overlapping zones already swept reads "fresh". That is the
        #     bare per-IFC pattern docs/strategies/bx-sd.md forbids ("Do not revert freshness to the
        #     bare per-IFC _first_tap"); it was applied in bx_sd_mitigation and bx_sd_setup and missed
        #     here, which is the other half of the tapped-FVG complaint.
        if level_pre_mitigated(h4, fvg, zones):
            continue
        key = f"{sid}_cont_{ztime(z)}_{z.direction}"
        if delivery_ledger.is_delivered(key):
            continue
        res = confirm_continuation(fvg, z, h4, m5, m1, analysis_tfs, htf_map, pip)
        if res is None:
            continue
        trig, conf, label, setup = res
        sig = build_signal(symbol, setup, conf, trig, pip, digits, sid, name)
        # SAY WHAT THIS IS. It is not an ordinary zone entry and must not read like one: the zone
        # itself has never been touched, so this is a bet that price continues from the imbalance in
        # front of it. Leads the card, before any grade or confluence.
        sig.technical_reasons.insert(
            0, f"⚠️ FVG CONTINUATION [{conf.grade}] — the 4H {z.direction} zone below has NOT been "
               f"mitigated. Price tapped and respected the imbalance in front of it, confirmed on "
               f"{label}. It may continue from here and never reach the zone — lower conviction than "
               f"a mitigated-and-respected zone entry.")
        sig.market_context = (f"BX-S/D FVG CONTINUATION [{conf.grade}] — {symbol}: the 4H {z.direction} "
                              f"zone is still UNMITIGATED; price tapped and held the imbalance in front "
                              f"of it and continued, {label}-confirmed, {trig.rr}R. May never reach the "
                              f"zone.")
        sig.dedup_key = key
        out.append(sig)
    return out
