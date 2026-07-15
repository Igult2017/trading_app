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

    reasons = [
        f"4H {'UPTREND' if buy else 'DOWNTREND'} — confirmed, pro-trend; fresh {zdir} zone tapped",
        f"Valid zone: IFC + broke structure + liquidity grabbed (fuel), priced in {pricing}",
        f"LTF CHoCH inside the zone (confirmed entry) — refined to a {conf.risk_pips:.1f} pip POI, "
        f"grade {conf.grade} (score {conf.score})",
        f"1M {trig.details.get('method', 'CHoCH')} trigger — {side} {trig.entry:.{digits}f}",
        f"SL {trig.sl:.{digits}f} | TP {trig.tp:.{digits}f} | "
        f"Risk {trig.details['risk_pips']:.1f} pips | RR {trig.rr}:1",
    ]
    smc = [
        f"CTX::4H TREND::{'UPTREND' if buy else 'DOWNTREND'} (PRO-TREND, CONFIRMED)",
        f"CTX::4H ZONE::FRESH {zdir.upper()} (IFC + BOS + LIQUIDITY GRAB)",
        f"CTX::PRICING::{pricing.upper()}",
        f"PA::LTF CHoCH CONFIRMED — REFINED {conf.risk_pips:.1f}PIP POI (GRADE {conf.grade})",
        f"PA::1M {trig.details.get('method', 'CHoCH').upper()} — {trig.details['entry_mode'].upper()} ENTRY, "
        f"{trig.rr}R (TP {trig.details['tp_source'].replace('_', ' ').upper()})",
    ]
    if divergent:
        smc.append("PA::RSI DIVERGENCE ALIGNED")

    return Signal(
        symbol            = symbol,
        direction         = Direction.BUY if buy else Direction.SELL,
        strategy_id       = strategy_id,          # _watch → private DM (Phase 1)
        strategy_name     = strategy_name,
        label             = "451HRZ",             # 4H zone + 1M/5M entry tag (retest / continuation / core)
        to_channel        = True,                 # BX entries are PUBLIC (signal channel); its mitigation
                                                  # heads-up + invalidation stay in the admin DM.
        entry_price       = round(trig.entry, digits),
        stop_loss         = round(trig.sl, digits),
        take_profit       = round(trig.tp, digits),
        risk_reward       = trig.rr,
        confidence        = min(0.95, 0.60 + conf.score / 400.0),
        primary_timeframe = TF.H4,
        alert_only        = True,                 # Phase 1 = DM-only alert (no DB / AssetPage yet)
        technical_reasons = reasons,
        smc_factors       = smc,
        market_context    = (f"BX-S/D (confirmed) — {side} {symbol} off a fresh 4H {zdir} zone, "
                             f"LTF CHoCH-confirmed, refined {conf.risk_pips:.1f}pip, grade {conf.grade}, "
                             f"{trig.rr}R entry {trig.entry:.{digits}f}"),
    )
