"""
BX-S/D — assemble a Signal from a resolved cascade (4H setup + LTF confluence + entry trigger).

Kept separate so bx_sd.analyze() stays lean (150-line rule). No trading logic here — pure
formatting of an already-decided entry/SL/TP into the platform's panel-labelled Signal.
"""
from core.types import TF, Signal, Direction
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

    reasons = [
        setup.confluences.get("control_phrase") or f"Fresh 4H {zdir} zone tapped",
        setup.confluences.get("entry_type_phrase") or "Entry-2 justification (LTF BMS/CHoCH)",
        f"Valid 4H zone: IFC + broke structure + liquidity grabbed (fuel), priced in {pricing}",
        f"GRADE {conf.grade} — {align_txt}{back_txt}; refined to a {conf.risk_pips:.1f} pip POI",
        f"Confirmation entry: {trig.details.get('method', 'CHoCH')} BMS inside the zone on the entry TF "
        f"— {side} {trig.entry:.{digits}f}",
        f"SL {trig.sl:.{digits}f} | TP {trig.tp:.{digits}f} | "
        f"Risk {trig.details['risk_pips']:.1f} pips | RR {trig.rr}:1",
    ]
    _ctl      = setup.confluences.get("control") or {}
    _ctl_side = _ctl.get("side", "none")
    _with     = _ctl.get("with_control")
    smc = [
        # THREE states, not two. `with_control` is None when no side is in control — printing
        # "AGAINST" there would assert something untrue about an untested market.
        f"CTX::CONTROL::{_ctl_side.upper()} ("
        f"{'UNTESTED' if _with is None else ('WITH' if _with else 'AGAINST')}"
        f"-CONTROL {zdir.upper()} ENTRY, CONFIRMED)",
        f"CTX::ENTRY TYPE::{(setup.confluences.get('entry_type') or {}).get('book_situation', 'Entry-2')}"
        f" — JUSTIFICATION (LTF BMS/CHoCH, NEVER AN UNCONFIRMED LIMIT)",
        f"CTX::4H ZONE::FRESH {zdir.upper()} (IFC + BOS + LIQUIDITY GRAB)",
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
        # A REAL signal: saved to the DB, shown on AssetPage, and — the point — MONITORED, so the
        # monitor closes it on TP/SL and the channel is told how it ended. As an alert_only signal it
        # bypassed the validator entirely and was never saved, so BX posted entries into the channel
        # and then went silent on every one of them. Routing is by strategy_id now, like VIX.1:
        # `bx_sd` -> channel, `bx_sd_watch` -> admin DM.
        alert_only        = False,
        technical_reasons = reasons,
        smc_factors       = smc,
        market_context    = (f"BX-S/D [{conf.grade}] — {side} {symbol} off a fresh 4H {zdir} zone, "
                             f"{align_txt}{back_txt}, entry-TF confirmed, refined {conf.risk_pips:.1f}pip, "
                             f"{trig.rr}R entry {trig.entry:.{digits}f}"),
    )
