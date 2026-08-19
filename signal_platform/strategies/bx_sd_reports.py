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
from strategies.bx_sd_entry import reaction_on
from strategies.bx_sd_tap_alert import tap_alert_signal, REVERSAL_ONLY
# `_setup_for_zone`, `confirm_grade` and `build_signal` were imported for the RETEST path and went
# unused when it was deleted (2026-08-01). `bx_sd_retest.py` went with them: this was its ONLY
# importer, so the module was orphaned outright. (A first pass at this comment claimed bx_sd_watch
# still used it — it does not, and the audit caught that.)

_MIN_PIPS = 3.0   # ignore micro zones — same noise floor the cascade applies
_RECENT   = 6     # "now" = within the last N 4H bars


def scan_reports(symbol: str, entry_tf: list[Candle], m5: list[Candle], m1: list[Candle],
                 h4: list[Candle], htf_candles: dict, pip: float, digits: int,
                 name: str, sid: str, book=None) -> list[Signal]:
    """`analysis_tfs` was a parameter here and is GONE. It, along with `entry_tf`/`m5`/`m1`, was
    left behind when the retest path was deleted (2026-08-01) and read by nothing for three days.
    The other three come back into real use below as path ③; `analysis_tfs` did not, so it went."""
    out: list[Signal] = []
    dm_id   = f"{sid}_watch"   # a heads-up is not a signal -> admin DM, never the channel
    htf_map = htf_zone_map(htf_candles, pip)
    tmin    = _MIN_PIPS * pip
    bars    = closed_only(h4)
    if len(bars) < _RECENT:
        return out
    # built once per scan by bx_sd.analyze; the fallback keeps this callable standalone
    marked  = build(h4, pip, session_candles=m5 or entry_tf) if book is None else book
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

    # ③ TAP ALERT ("cheeky one") — the tap ① just reported, PLUS a 1M/5M reaction. PUBLIC.
    #
    # User's rule, 2026-08-04: *"For price taps into 4HR zone and there is a confirmation in 5M or
    # 1M a cheeky signal should be sent. … So I am asking for the first signal before the pullback."*
    #
    # THE DIVIDER FROM THE REAL ENTRY IS `role`, AND IT IS ABSOLUTE (rewritten 2026-08-15).
    #
    # It used to be `respected`: this path required the zone NOT to be respected, `detect_setup`
    # required that it WAS, so one zone could never produce both at the same moment. The document's
    # entry model removed the `respected` requirement — the trigger is now the tap itself — which
    # deleted that guarantee. Without a replacement, a tapped extreme zone would fire a "cheeky"
    # heads-up AND a real signal on the same scan, and the whole point of having two cards is that
    # you never have to ask which one means "place a trade".
    #
    # THE REPLACEMENT: `detect_setup` takes ONLY zones whose role is not `decisional` — in practice
    # the `extreme` of a stack, or a zone standing alone. This path therefore takes only the zones
    # the entry will never take: the DECISIONAL ones. Same guarantee, drawn on the line the document
    # itself draws, and it makes the tap alert genuinely informative — it is now the card that says
    # "price is at a zone, but it is the decisional one, so we are standing aside."
    #
    # Do not relax either side of this without replacing the guarantee again.
    #
    # ① and ③ can both fire on one tap, and that is intended: ① is the admin's diagnostic in the DM
    # and fires on the tap alone; ③ is the room's card and needs the reaction too. Different
    # audiences, different bars to clear.
    tap = None
    # NEWEST FIRST, explicitly. `build()` appends as it replays bars in order, so `marked` is
    # OLDEST-first — taking `marked[0]` would have published the stalest tapped zone on the book
    # while a fresher one was also being tapped. `detect_setup` sorts for the same reason.
    for mz in sorted(marked, key=lambda m: m.ifc_time, reverse=True):
        if not mz.live:
            continue                        # a broken zone is nobody's business
        if mz.role != "decisional":
            continue                        # the entry takes these — see the divider note above
        if not mz.tapped_by(live) or (mz.top - mz.bottom) < tmin:
            continue
        key = f"{sid}_tap_{mz.ifc_time}_{mz.direction}_v{mz.live_visit()}"
        if delivery_ledger.is_delivered(key):
            continue
        z = to_zone(mz, bars)
        if z is None:
            continue
        # THE SAME confirmation the real entry uses (`bx_sd_entry.reaction_on`), never a second
        # definition — see that function. 5M first, then 1M: the user named them in that order, and
        # the slower one is the less noisy read of the same reaction.
        want = "up" if mz.direction == "demand" else "down"
        for cs, tf_label in ((m5, "5M"), (m1, "1M"), (entry_tf, "entry TF")):
            if not cs or len(cs) < 20:
                continue
            method = reaction_on(cs, want, z, mz.direction, reversal_only=REVERSAL_ONLY)
            if method:
                # IS THIS THE MOST RECENT VALID ZONE ON ITS SIDE? The card says so, so it is
                # COMPUTED, never assumed — the alert takes the freshest *tapped* zone, which is not
                # the same thing as the freshest zone. A newer zone that is BROKEN does not count:
                # it is no longer a candidate for anything.
                is_newest = not any(m.direction == mz.direction and m.ifc_time > mz.ifc_time
                                    and m.state != "broken" for m in marked)
                # WHERE THE EXTREME SITS. The card warns that price is expected to run through this
                # decisional zone to reach the extreme, so it names that level — a warning the reader
                # can act on beats one they have to take on trust. Same group, same side: the zone
                # `classify_roles` marked `extreme`, if one is still live.
                _ex = [m for m in marked
                       if m.live and m.direction == mz.direction and m.role == "extreme"]
                _extreme_at = (max(m.proximal for m in _ex) if mz.direction == "supply"
                               else min(m.proximal for m in _ex)) if _ex else None
                tap = tap_alert_signal(z, symbol, method, tf_label, digits, name, sid,
                                       htf_backing(z, htf_map), live.time,
                                       mitigation_kind=mz.mitigation_kind, retaps=mz.retaps,
                                       is_newest=is_newest, extreme_at=_extreme_at)
                tap.dedup_key = key          # committed only once the channel post lands
                break
        if tap is not None:
            break                            # ONE per symbol per scan — sorted newest-first above,
                                             # so this is the freshest tapped zone, and a multi-zone
                                             # tap cannot burst the channel with four cards at once.
    if tap is not None:
        out.append(tap)

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
