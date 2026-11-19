"""PIX — what the Assets page's three panels show for a PIX signal (19 Nov 2026).

His report: *"Assets page is not displaying anything here in this columns"* — Context Alignment, Technical Confluence and
Price Action were empty for every PIX signal, because the page reads only the signal's LABELLED factor list
(`smc_factors`: `CTX::label::value`, `IND::name::reading`, `PA::note` — `client/src/pages/AssetPage.tsx` splitFactors)
and PIX never filled it. These are built from facts the plan already holds; nothing here decides a trade.
"""
from __future__ import annotations


def _r(v: float) -> str:
    """Up to 5 decimals, trailing zeros dropped — NOT `:g`, whose 6 significant digits cut 64556.62 to 64556.6."""
    return f"{v:.5f}".rstrip("0").rstrip(".")


def flow(line: str) -> list[str]:
    """The card's order-flow line → Technical Confluence rows (status, CVD, delta)."""
    if "not available" in line and ":" not in line.split("—")[0]:
        return ["IND::ORDER FLOW::NOT AVAILABLE YET"]
    status = "CONFIRMS" if "CONFIRMS" in line else "DOES NOT AGREE" if "does NOT agree" in line else "NOT AVAILABLE"
    out = [f"IND::ORDER FLOW::{status}"]
    detail = line.split(": ", 1)[1] if ": " in line else ""
    for part in (p.strip() for p in detail.split(", ") if p.strip()):
        if "divergence" in part or "convergence" in part:
            v = ("DIVERGENCE ✓" if part.startswith("CVD divergence") else "CONVERGENCE ✗" if "convergence" in part
                 else "NONE ✗" if part.startswith("no CVD") else "N/A")
            out.append(f"IND::CVD::{v}")
        elif part.startswith("delta"):
            v = "N/A" if "not available" in part else part[len("delta "):].replace(" on the reaction", "").upper()
            out.append(f"IND::DELTA::{v}")
    return out


def profile(prof, role: str) -> list[str]:
    return [f"IND::VOLUME PROFILE::POC {_r(prof.poc)} ({role.upper()})"] if prof is not None and role else (
        [f"IND::VOLUME PROFILE::POC {_r(prof.poc)}"] if prof is not None else [])


def entry(e, bull: bool, target: str) -> list[str]:
    """Price Action: his 1M sequence as it actually happened, then the order."""
    return [f"PA::Touched the zone, {len(e.reaction)} candles {'up' if bull else 'down'}, then a pullback candle",
            f"PA::Stop order at the pullback's {'high' if bull else 'low'} — stop behind the pullback",
            f"PA::{target}"]


def zone(src: str, bull: bool, bz, outer, want: str, e, flow_line: str, prof, role: str, rr: float) -> list[str]:
    z = bz.zone
    ctx = [f"CTX::TREND::{src} {'UP' if bull else 'DOWN'}",
           f"CTX::ZONE::{bz.tf} {want.upper()} {_r(z.bottom)}–{_r(z.top)}"]
    if outer is not None:
        ctx.append(f"CTX::INSIDE::{outer.tf} {want.upper()} {_r(outer.zone.bottom)}–{_r(outer.zone.top)}")
    ctx.append(f"CTX::TRAVELLED TO::{bz.reached.direction.upper()} {_r(bz.reached.bottom)}–{_r(bz.reached.top)}")
    return ctx + flow(flow_line) + profile(prof, role) + entry(e, bull, f"Target {rr:g}R")


def level(trend: int, bull: bool, price: float, room_r: float, e, flow_line: str, rr: float) -> list[str]:
    state = "RANGING" if trend == 0 else ("UP" if trend > 0 else "DOWN")
    ctx = [f"CTX::TREND::{state}", f"CTX::LEVEL::5M {'SUPPLY' if not bull else 'DEMAND'} {_r(price)}",
           f"CTX::ROOM::{room_r:.1f}R TO THE OPPOSITE LEVEL"]
    return ctx + flow(flow_line) + entry(e, bull, f"Target {rr:g}R")
