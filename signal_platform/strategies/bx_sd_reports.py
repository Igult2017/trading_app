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
from strategies.bx_sd_zones import min_zone_height
from strategies.bx_sd_htf import htf_zone_map, htf_backing
from strategies.bx_sd_mitigation import mitigation_signal
from strategies.bx_sd_strength import mitigation_note
from strategies.bx_sd_entry import reaction_on
from strategies.bx_sd_tap_alert import tap_alert_signal, REVERSAL_ONLY
# `_setup_for_zone`, `confirm_grade` and `build_signal` were imported for the RETEST path and went
# unused when it was deleted (2026-08-01). `bx_sd_retest.py` went with them: this was its ONLY
# importer, so the module was orphaned outright. (A first pass at this comment claimed bx_sd_watch
# still used it — it does not, and the audit caught that.)

# The micro-zone floor is `bx_sd_zones.min_zone_height` — a share of ATR, one definition
# shared with `bx_sd_setup` rather than a second copy of the number.
_RECENT   = 6     # "now" = within the last N 4H bars


def scan_reports(symbol: str, entry_tf: list[Candle], m5: list[Candle], m1: list[Candle],
                 h4: list[Candle], htf_candles: dict, pip: float, digits: int,
                 name: str, sid: str, book=None) -> list[Signal]:
    """`analysis_tfs` was a parameter here and is GONE. It, along with `entry_tf`/`m5`/`m1`, was
    left behind when the retest path was deleted (2026-08-01) and read by nothing for three days.
    The other three come back into real use below as path ③; `analysis_tfs` did not, so it went."""
    out: list[Signal] = []
    # THE `_watch` SUFFIX DOES NOT MAKE THIS PRIVATE, and the comment here claimed it did.
    #
    # It read: *"a heads-up is not a signal -> admin DM, never the channel"*. That was FALSE, and
    # verified false against production on 2026-08-25 rather than reasoned about:
    #   * `bx_sd_mitigation` sets `to_channel = True` on this very card;
    #   * the alert path (`dispatcher.on_setup_alert`) routes on `to_channel`, and it STRIPS `_watch`
    #     before checking the exemption list — the suffix only forces the DM on the CONFIRMED path
    #     (`on_signal_confirmed`), which this card never takes because it is `alert_only`;
    #   * production has `SIGNALS_DM_ONLY=true` and `DM_ONLY_EXEMPT` unset, so the default
    #     `"bx_sd,vix1"` applies and BX is exempt — making the condition
    #     `to_channel and (not dm_only or exempt)` reduce to `to_channel`, i.e. TRUE.
    # So this heads-up has been going to the PUBLIC CHANNEL, not the DM, for as long as that has held.
    #
    # The suffix still does real work — it is the DEDUP namespace, keeping these keys from colliding
    # with the entry's — so it stays. Only the claim about routing was wrong.
    dm_id   = f"{sid}_watch"   # dedup namespace only — routing is decided by `to_channel`
    htf_map = htf_zone_map(htf_candles, pip)
    bars    = closed_only(h4)
    if len(bars) < _RECENT:
        return out
    # AFTER `bars` exists: the floor is measured from the same closed bars everything else reads.
    tmin    = min_zone_height(bars, pip)
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
        # SIGNAL 1 = THE HTF EXTREME HAS BEEN TAPPED **AND RESPECTED** (2026-08-19). His sequence:
        #
        #     "The first one is when, after liquidity sweep, a valid extreme HTF zone is tapped and
        #      RESPECTED and there is a confirmation in 5M TF."
        #
        # THIS INVERTS WHAT WAS HERE. The condition read `state not in (unmitigated, wick_mitigated,
        # body_mitigated)` — i.e. it fired on any tapped zone EXCEPT a respected one, the opposite of
        # his rule. BX was announcing the setup before price had reacted at all, which is the moment
        # that carries no evidence: a tap proves only that price arrived.
        #
        # `respected` means price stayed clear of the zone for REACT_BARS closed bars — the
        # reaction itself, which is what births the child zone signal 2 waits for. So this is not a
        # stricter version of the old alert, it is a different event: the old one said "price is
        # here", this one says "price came here and turned".
        #
        # THE TRIGGER IS THE REACTION, NOT A LIVE TAP — and those are mutually exclusive, which is
        # what makes this worth spelling out. `respected` is stamped on a bar that does NOT touch
        # the zone (`bx_sd_registry.REACT_BARS`), so at that instant price is by definition off it.
        # The old line asked for `tapped_by(live)`; keeping it alongside `respected` would have been
        # a condition that can never be satisfied — the kind of check that reads correctly and
        # silently fires nothing. `respected_at` is the bar the reaction completed on, so recency on
        # THAT is the honest trigger.
        #
        # WITHIN THE LAST TWO CLOSED BARS, not exactly the newest: the scan runs every 60s against
        # 4H bars, so the transition bar stays newest for hours, and a two-bar window only tolerates
        # a scan landing across a boundary. Repeats are handled by the dedup key below, which is
        # keyed on `respected_at` for this path — one alert per reaction, not per visit.
        if mz.state != "respected" or mz.respected_at is None:
            continue
        if mz.respected_at not in {c.time for c in bars[-2:]}:
            continue
        if (mz.top - mz.bottom) < tmin:
            continue
        # PER VISIT, not per zone. Keying on the zone alone sent exactly ONE heads-up for its whole
        # life, so every later retap was swallowed — the opposite of the rule that a wick tap signals
        # AND its retap signals again. `live_visit()` is stable while price lingers inside and
        # increments when it comes back, so a lingering zone does not spam either.
        # ONE PER REACTION, not per visit. `live_visit()` counts return taps — the right unit while
        # this path fired on a tap, and the wrong one now that it fires on the zone being RESPECTED,
        # which happens once per reaction. Keying on `respected_at` means a later retap of the same
        # zone cannot re-open an alert that has already been sent for this reaction.
        key = f"{dm_id}_react_{mz.ifc_time}_{mz.direction}_{mz.respected_at}"
        if delivery_ledger.is_delivered(key):
            continue
        z = to_zone(mz, bars)
        if z is None:
            continue
        # ...AND A 5M CONFIRMATION, which his rule requires and this path never asked for:
        #     "a valid extreme HTF zone is tapped and respected and there is a confirmation in 5M TF"
        # The SAME function the entry uses (`bx_sd_entry.reaction_on`) — never a second definition of
        # "confirmed", which is the drift this codebase has already paid for once.
        want = "up" if mz.direction == "demand" else "down"
        if not any(reaction_on(cs, want, z, mz.direction, reversal_only=REVERSAL_ONLY)
                   for cs, _lbl in ((m5, "5M"), (m1, "1M"), (entry_tf, "entry TF"))
                   if cs and len(cs) >= 20):
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
    # ⚠ THAT GUARANTEE IS NOT ENFORCED ON EITHER SIDE TODAY, and this comment used to claim it was.
    #
    # It read: *"`detect_setup` takes ONLY zones whose role is not `decisional`"*. That refusal was
    # deleted on 2026-08-19 (see the `role` divider note in `bx_sd_setup` — the three property gates
    # replaced it) and there is no `role` test anywhere in `bx_sd_setup.py`; grep it. So a zone can in
    # principle fire this stand-aside card AND a real entry on the same tap. The claim survived here
    # for six days as documentation of a rule the code did not have — the exact failure the fix-log
    # discipline exists to stop, and it is now in the fix log for the second time.
    #
    # WHAT THIS PATH STILL DOES, truthfully: it takes zones labelled `decisional`, which as of
    # 2026-08-25 means their own reaction produced a FAKE change of character
    # (`bx_sd_lineage.choch_verdict`) — no longer "a neighbour further out won". That is a fact about
    # the zone, so the card is saying something real: price is here, and what this zone did last time
    # was not a genuine turn.
    #
    # Restoring a hard divider between the two cards is a SEPARATE defect with its own blast radius —
    # deliberately not fixed in the same change. Recorded in the architecture doc's open defects.
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
                # SAME GROUP ONLY. Without the group test this took the globally furthest extreme
                # on the book — measured on EUR/USD, a decisional zone at 1.14066 was told the
                # extreme was 1.19601, 550 pips away and from a different move. Right side, wrong
                # zone, printed as fact on a card a reader may act on.
                _ex = [m for m in marked
                       if m.live and m.direction == mz.direction and m.role == "extreme"
                       and m.group == mz.group]
                _extreme_at = (max(m.proximal for m in _ex) if mz.direction == "supply"
                               else min(m.proximal for m in _ex)) if _ex else None
                # NO LIVE EXTREME IN THIS GROUP -> LOOK BEYOND IT (2026-08-19).
                #
                # A group can still hold no extreme — every member spent without any of them being
                # RESPECTED — and the card then said only "an order here is the liquidity that
                # carries price to the extreme" without naming where that is. His point: *"the card
                # at least was supposed to report the one that has been respected above it."*
                #
                # THIS FIRES FAR LESS OFTEN SINCE 2026-08-23. The reason given here used to be "only
                # an UNMITIGATED zone may be the extreme", which is no longer true: a respected zone
                # is now exactly what wins the label (`bx_sd_registry._label`). The fallback is kept
                # because "tapped but never reacted" groups are still real, not because of that.
                #
                # So fall back to the nearest zone FURTHER OUT on the same side that is still
                # unmitigated, whatever group it belongs to. That is genuinely where price is
                # travelling: on his EUR/USD case the named level was 1.16380 (spent) while six
                # unmitigated supply zones sat above it. Nearest-first, not furthest — the next
                # untouched zone is the next thing price has to deal with, and the 550-pip
                # cross-move mistake this file already guards against came from taking the furthest.
                if _extreme_at is None:
                    # TRADEABLE ONLY — unmitigated AND not decisional. The card's wording is "the
                    # extreme at X is the one we take", so naming a decisional zone there would tell
                    # him to take the very thing the rule forbids. On his EUR/USD case the nearest
                    # unmitigated zone above was 1.17430 (decisional, grp3); the right answer is
                    # 1.17701 — that group's extreme, and the next level actually on offer.
                    _beyond = [m for m in marked
                               if m.live and m.direction == mz.direction
                               and m.state == "unmitigated" and m.role != "decisional"
                               and (m.proximal > mz.proximal if mz.direction == "supply"
                                    else m.proximal < mz.proximal)]
                    if _beyond:
                        _extreme_at = (min(m.proximal for m in _beyond) if mz.direction == "supply"
                                       else max(m.proximal for m in _beyond))
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
    # (`bx_sd_setup.detect_setup`) absorbed it — at the time by requiring `respected` plus a tap or
    # a 4H pullback, and since 2026-08-15 by the tap of a non-decisional zone alone,
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
