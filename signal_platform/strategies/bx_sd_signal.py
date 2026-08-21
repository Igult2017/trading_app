"""
BX-S/D — assemble a Signal from a resolved cascade (4H setup + LTF confluence + entry trigger).

Kept separate so bx_sd.analyze() stays lean (150-line rule). No trading logic here — pure
formatting of an already-decided entry/SL/TP into the platform's panel-labelled Signal.
"""
from core.types import TF, Signal, Direction
from notifications import titles
from charting import theme   # card palette — one source of truth for band colour
from strategies.bx_sd_setup import SetupResult
from strategies.bx_sd_ltf import LTFConfluence
from strategies.bx_sd_entry import EntryTrigger


def build_signal(symbol: str, setup: SetupResult, conf: LTFConfluence, trig: EntryTrigger,
                 pip: float, digits: int, strategy_id: str, strategy_name: str) -> Signal:
    buy   = trig.direction == "buy"
    side  = "BUY" if buy else "SELL"
    zdir  = "demand" if buy else "supply"
    pricing = setup.confluences.get("pricing", "")
    divergent = bool(setup.confluences.get("rsi_divergence") or conf.details.get("ltf_divergence"))
    aligned   = conf.details.get("aligned_tfs", [])          # analysis TFs (15M/30M/1H) that aligned
    backing   = conf.details.get("backing", [])              # HTF (D1/W1/MN) zones that back it
    align_txt = f"{', '.join(aligned)} aligned" if aligned else "no analysis-TF alignment"
    back_txt  = f" + HTF backing ({', '.join(backing)})" if backing else ""

    # HOW the zone was mitigated, and how strong it is. Both come from the zone book and were
    # previously invisible on the card: a wick-only tap and a full body mitigation read identically,
    # so there was no way to tell a still-loaded zone from a spent one. The user's rule (2026-07-30):
    # a wick tap means the orders were never filled and price is expected back; a retap of a
    # body-mitigated zone is tradeable but must carry a caution.
    mit_note = setup.confluences.get("mitigation_note") or ""
    strength = setup.confluences.get("strength_phrase") or ""

    # HOW WE GOT IN — a retap and a pullback are different trades and the card must say which.
    # The zone is RESPECTED in both cases (price tapped it and closed a full zone-height clear);
    # what differs is whether price came back TO the zone or is retracing within the move away
    # from it. Before this the card said "Fresh 4H zone tapped" for both, which was wrong twice
    # over: the zone is not fresh (freshness stopped being the trigger when `respected` became
    # mandatory), and "tapped" describes only one of the two ways in.
    # THE CARD SAYS WHICH ZONE OF THE STACK THIS IS. The document's whole warning is that entering
    # the near zone makes you the liquidity that carries price to the far one, so "which one is this"
    # is the single most important fact on the card — and it was computed but never shown.
    _role = setup.confluences.get("zone_role") or ""
    _through = setup.confluences.get("broke_through") or 0
    via_txt = (f"EXTREME 4H {zdir} zone TAPPED — the furthest of its group, so the decisional zones "
               f"between price and here are liquidity on the way" if _role == "extreme"
               else f"4H {zdir} zone TAPPED — it stands alone in its group")
    # THE DOCUMENT'S TWO CONFLUENCES, shown as confluences — present is a plus, absent is not a
    # refusal. Only criterion 1 (price is at a higher-timeframe zone) is a requirement, and it is
    # satisfied by construction: BX only ever trades a tapped 4H zone.
    through_txt = (f"Double zone breakout — the move that left this zone closed through {_through} "
                   f"opposite zones (the document's strong-confluence case)" if _through >= 2 else None)
    swept_txt = ("Liquidity was still resting and got taken on the way in — the zone is not the "
                 "only fuel left" if setup.confluences.get("swept") else None)

    reasons = [
        setup.confluences.get("control_phrase") or via_txt,
        via_txt if setup.confluences.get("control_phrase") else None,
        through_txt,
        swept_txt,
        setup.confluences.get("entry_type_phrase") or "Entry-2 justification (LTF BMS/CHoCH)",
        f"Valid 4H zone: IFC + broke structure + liquidity grabbed (fuel), priced in {pricing}",
        f"GRADE {conf.grade} — {align_txt}{back_txt}; refined to a {conf.risk_pips:.1f} pip POI",
        f"Confirmation: {trig.details.get('method', 'CHoCH')} BMS inside the zone on the entry TF",
        f"STOP ORDER {side} {trig.entry:.{digits}f} — fills only if price continues past the "
        f"confirmation, never if the reaction fails",
        f"SL {trig.sl:.{digits}f} (beyond the 4H zone distal) | TP {trig.tp:.{digits}f} | "
        f"Risk {trig.details['risk_pips']:.1f} pips | RR {trig.rr}:1",
    ]
    reasons = [x for x in reasons if x]      # via_txt is None when it duplicates control_phrase
    if strength:
        reasons.insert(3, strength)
    if mit_note:
        reasons.insert(1, mit_note)
    _ctl      = setup.confluences.get("control") or {}
    _ctl_side = _ctl.get("side", "none")
    _with     = _ctl.get("with_control")
    smc = [
        # THREE states, not two. `with_control` is None when no side is in control — printing
        # "AGAINST" there would assert something untrue about an untested market.
        f"CTX::CONTROL::{_ctl_side.upper()} ("
        f"{('CONTESTED' if _ctl_side == 'contested' else 'UNTESTED') if _with is None else ('WITH' if _with else 'AGAINST')}"
        f"-CONTROL {zdir.upper()} ENTRY, CONFIRMED)",
        f"CTX::ENTRY TYPE::{(setup.confluences.get('entry_type') or {}).get('book_situation', 'Entry-2')}"
        f" — JUSTIFICATION (LTF BMS/CHoCH, NEVER AN UNCONFIRMED LIMIT)",
        # NOT "RESPECTED" — that requirement went with the document's entry model (2026-08-15).
        # The trigger is the TAP of a non-decisional zone, so the panel says which zone of the stack
        # it was, which is the fact that now decides whether it is tradeable at all.
        f"CTX::4H ZONE::{(_role or 'lone').upper()} {zdir.upper()} TAPPED (IFC + BOS + LIQUIDITY GRAB)"
        f"{f' — BROKE THROUGH {_through}' if _through >= 2 else ''}",
        f"CTX::PRICING::{pricing.upper()}",
        f"MTF::GRADE {conf.grade} — {align_txt.upper()}{(' + HTF ' + ', '.join(backing)) if backing else ''}",
        f"PA::CONFIRMATION ENTRY {trig.details.get('method', 'CHoCH').upper()} — "
        f"{trig.details['entry_mode'].upper()}, {trig.rr}R (TP {trig.details['tp_source'].replace('_', ' ').upper()})",
    ]
    if divergent:
        smc.append("PA::RSI DIVERGENCE ALIGNED")

    return Signal(
        symbol            = symbol,
        direction         = Direction.BUY if buy else Direction.SELL,
        strategy_id       = strategy_id,          # `bx_sd` → channel; `bx_sd_watch` → DM
        strategy_name     = strategy_name,
        label             = "451HRZ",             # 4H zone + 1M/5M entry tag (retest / continuation / core)
        entry_price       = round(trig.entry, digits),
        stop_loss         = round(trig.sl, digits),
        take_profit       = round(trig.tp, digits),
        risk_reward       = trig.rr,
        confidence        = min(0.95, 0.60 + conf.score / 400.0),
        primary_timeframe = TF.H4,
        # The 4H zone, shaded on the rendered card. `chart_bands` is a GENERIC (low, high, colour,
        # label) contract on Signal — the renderer never learns what a supply zone is, so nothing
        # about BX leaks into how another strategy's card is drawn.
        # Colour comes from the CARD THEME, never a literal. Two hex codes were pasted here when the
        # card was dark; the card is light now and they no longer matched anything, which is what a
        # duplicated constant always eventually does.
        chart_bands       = ([(setup.zone.bottom, setup.zone.top,
                               theme.ZONE_DEMAND if buy else theme.ZONE_SUPPLY,
                               f"4H {zdir.upper()}")] if setup.zone else []),
        # A REAL signal: saved to the DB, shown on AssetPage, and — the point — MONITORED, so the
        # monitor closes it on TP/SL and the channel is told how it ended. As an alert_only signal it
        # bypassed the validator entirely and was never saved, so BX posted entries into the channel
        # and then went silent on every one of them. Routing is by strategy_id now, like VIX.1:
        # `bx_sd` -> channel, `bx_sd_watch` -> admin DM.
        alert_only        = False,
        stage             = "ready",   # STAGE 2 — a placeable entry with a stop and a target
        headline          = titles.CONFIRMED_ENTRY,          # signal 2, in his own label
        technical_reasons = reasons,
        smc_factors       = smc,
        # THIS LINE HAS NOW BEEN WRONG TWICE, both times because the entry model moved and the
        # sentence did not. It said "off a fresh 4H zone" until 2026-08-01 (when `respected` became
        # mandatory), then "off a respected 4H zone" until 2026-08-15 (when the tap became the
        # trigger and `respected` was dropped). It names what the cascade ACTUALLY required.
        market_context    = (f"BX-S/D [{conf.grade}] — {side} {symbol} off a tapped "
                             f"{(_role + ' ') if _role else ''}4H {zdir} zone, "
                             f"{align_txt}{back_txt}, entry-TF confirmed, refined {conf.risk_pips:.1f}pip, "
                             f"{trig.rr}R stop-order entry {trig.entry:.{digits}f}"),
    )
