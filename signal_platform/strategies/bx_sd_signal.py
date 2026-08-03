"""
BX-S/D — assemble a Signal from a resolved cascade (4H setup + LTF confluence + entry trigger).

Kept separate so bx_sd.analyze() stays lean (150-line rule). No trading logic here — pure
formatting of an already-decided entry/SL/TP into the platform's panel-labelled Signal.
"""
from core.types import TF, Signal, Direction
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
    _via = setup.confluences.get("entry_via") or ""
    via_txt = {
        "retap":          f"Respected 4H {zdir} zone RE-TAPPED — price is back at the zone",
        "pullback":       f"Respected 4H {zdir} zone — price left it and PULLED BACK on the 4H",
        "pullback+retap": f"Respected 4H {zdir} zone — 4H PULLBACK that also re-tapped the zone",
    }.get(_via, f"Respected 4H {zdir} zone")

    reasons = [
        setup.confluences.get("control_phrase") or via_txt,
        via_txt if setup.confluences.get("control_phrase") else None,
        setup.confluences.get("entry_type_phrase") or "Entry-2 justification (LTF BMS/CHoCH)",
        f"Valid 4H zone: IFC + broke structure + liquidity grabbed (fuel), priced in {pricing}",
        f"GRADE {conf.grade} — {align_txt}{back_txt}; refined to a {conf.risk_pips:.1f} pip POI",
        f"Confirmation entry: {trig.details.get('method', 'CHoCH')} BMS inside the zone on the entry TF "
        f"— {side} {trig.entry:.{digits}f}",
        f"SL {trig.sl:.{digits}f} | TP {trig.tp:.{digits}f} | "
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
        # NOT "FRESH" — a fresh zone is exactly what no longer qualifies. The cascade requires the
        # zone to have been tapped and RESPECTED first; entering on a first touch is the model that
        # produced the losses and was removed 2026-08-01.
        f"CTX::4H ZONE::RESPECTED {zdir.upper()} (IFC + BOS + LIQUIDITY GRAB)"
        f"{' — ' + _via.upper().replace('+', ' + ') if _via else ''}",
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
        technical_reasons = reasons,
        smc_factors       = smc,
        # "off a fresh 4H zone" was false from 2026-08-01: the cascade requires the zone to have
        # been RESPECTED, so a fresh zone is precisely what does not fire. This is the line the
        # user reads on Telegram, so it names the actual way in.
        market_context    = (f"BX-S/D [{conf.grade}] — {side} {symbol} off a respected 4H {zdir} zone"
                             f"{' (' + _via.replace('+', ' + ') + ')' if _via else ''}, "
                             f"{align_txt}{back_txt}, entry-TF confirmed, refined {conf.risk_pips:.1f}pip, "
                             f"{trig.rr}R entry {trig.entry:.{digits}f}"),
    )
