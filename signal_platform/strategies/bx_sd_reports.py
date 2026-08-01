"""
BX-S/D — the 4H-zone reports, driven by the ZONE BOOK (bx_sd_registry).

  ① MITIGATION heads-up (DM) — a marked zone just moved unmitigated → mitigated (price tapped it).
  ② RETEST — DELETED 2026-08-01, see the note at the end of `scan_reports`.

**This module is now the heads-up path and nothing else.** ① reads LIFECYCLE STATE off zones marked
once when they qualified. Nothing here re-derives a zone, recomputes a tap, or re-tests validity —
that is what let a candle beside a gap masquerade as a zone (27 Jul: a break at lag −1, before its
own imbalance existed).

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
from strategies.bx_sd_strength import mitigation_note
# `_setup_for_zone`, `confirm_grade` and `build_signal` were imported for the RETEST path and went
# unused when it was deleted (2026-08-01). `bx_sd_retest.py` went with them: this was its ONLY
# importer, so the module was orphaned outright. (A first pass at this comment claimed bx_sd_watch
# still used it — it does not, and the audit caught that.)

_MIN_PIPS = 3.0   # ignore micro zones — same noise floor the cascade applies
_RECENT   = 6     # "now" = within the last N 4H bars


def scan_reports(symbol: str, h4: list[Candle], analysis_tfs: list, entry_tf: list[Candle],
                 m5: list[Candle], m1: list[Candle], htf_candles: dict, pip: float, digits: int,
                 name: str, sid: str, book=None) -> list[Signal]:
    out: list[Signal] = []
    dm_id   = f"{sid}_watch"   # a heads-up is not a signal -> admin DM, never the channel
    htf_map = htf_zone_map(htf_candles, pip)
    tmin    = _MIN_PIPS * pip
    bars    = closed_only(h4)
    if len(bars) < _RECENT:
        return out
    # built once per scan by bx_sd.analyze; the fallback keeps this callable standalone
    marked  = build(h4, pip) if book is None else book
    live    = h4[-1]        # the FORMING bar — a tap is an event happening NOW

    # ① MITIGATION heads-up — the zone was tapped for the first time, recently.
    for mz in marked:
        # tapped RIGHT NOW (live bar), not "sometime in the last 24h" — see bx_sd_setup
        # untapped OR already-mitigated + a LIVE tap: the forming bar's tap is not in the book yet
        # (the registry reads CLOSED bars), so demanding a mitigated state here would mean the
        # heads-up could never coincide with the tap actually happening.
        # `wick_mitigated`/`body_mitigated` replaced `mitigated` (2026-07-30) — a retap of either is
        # still worth a heads-up, and the card distinguishes them.
        if mz.state not in ("unmitigated", "wick_mitigated", "body_mitigated") or not mz.tapped_by(live):
            continue
        if (mz.top - mz.bottom) < tmin:
            continue
        # PER VISIT, not per zone. Keying on the zone alone sent exactly ONE heads-up for its whole
        # life, so every later retap was swallowed — the opposite of the rule that a wick tap signals
        # AND its retap signals again. `live_visit()` is stable while price lingers inside and
        # increments when it comes back, so a lingering zone does not spam either.
        key = f"{dm_id}_mit_{mz.ifc_time}_{mz.direction}_v{mz.live_visit()}"
        if delivery_ledger.is_delivered(key):
            continue
        z = to_zone(mz, bars)
        if z is None:
            continue
        sig = mitigation_signal(z, symbol, htf_backing(z, htf_map), digits, name, dm_id,
                                note=mitigation_note(mz), retaps=mz.retaps)
        sig.dedup_key = key                 # committed only when the DM actually lands
        out.append(sig)

    # ② RETEST — DELETED 2026-08-01. It became a strict SUBSET of the core cascade.
    #
    # It required: `state == respected`, a LIVE tap, and a B/A 1M/5M confirmation. The cascade
    # (`bx_sd_setup.detect_setup`) now requires `respected` plus EITHER a live tap OR a 4H pullback,
    # then confirms on the same entry models — so every zone this path could fire on, the cascade
    # already fires on, and BOTH would emit for one zone. They carry different grades and different
    # dedup keys, so they could not even suppress each other: the exact duplicate the architecture
    # doc warns about.
    #
    # The cascade absorbed the model rather than the reverse, because it owns the entry trigger, the
    # watch lock and the invalidation alert — none of which this path ever had. The retap did NOT
    # disappear with it; it is one of the cascade's two ways in.
    #
    # The dead loop that stood here (`for mz in []:`) is gone with it. A disabled branch that still
    # reads like live code is how the next session concludes the feature exists.
    return out
