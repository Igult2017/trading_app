"""THE STOP EVERY COPIED TRADE CARRIES, and the risk ceiling it enforces. Pure arithmetic, no broker.

HIS RULES, 15 Nov 2026, verbatim:

    "When the provider has no stop loss set stop loss to default at 1% of the followers account but
     the follower can reset it to his preferred SL. If the providers SL is bigger than 1% also set it
     to 1% default for the follower unless the follower set it otherwise. Also the follower cannot
     risk more than 3% of his account in a single trade."
    "Every existing follower default risk is 1% but they cant reset it to more than 3% meaning 3% is
     the highest."

So each follower has ONE number — the most one copied trade may lose, `risk_percent`, default 1%,
never above 3% — and every copied entry carries a stop that keeps the loss inside it:

    master's stop loses <= risk %   -> keep the master's stop
    master's stop would lose more   -> move the follower's stop closer, to where the loss = risk %
    master has no stop              -> put the follower's stop where the loss = risk %

The lot size is NOT changed here — it comes from the follower's own sizing mode. The stop is what
holds the loss to the follower's %.
"""
DEFAULT_RISK_PCT = 1.0
MAX_RISK_PCT = 3.0          # his ceiling — nothing may set more
MIN_RISK_PCT = 0.1
MIN_STOP_PIPS = 1.0         # a stop nearer than this sits inside the spread: refuse, don't place it


def effective_risk_pct(follower) -> float:
    """The follower's risk per trade: their setting, 1% if unset, never above 3% or below 0.1%."""
    try:
        v = float(getattr(follower, "risk_percent", None))
    except (TypeError, ValueError):
        v = 0.0
    if not v or v <= 0:
        v = DEFAULT_RISK_PCT
    return max(MIN_RISK_PCT, min(MAX_RISK_PCT, v))


def _on_stop_side(action: str, entry: float, level: float) -> bool:
    return level < entry if action == "BUY" else level > entry


def follower_stop(action: str, entry, master_sl, lots, balance, risk_pct,
                  pip_size, pip_value) -> tuple[float | None, str, bool]:
    """(stop price, what was done in words, refused). `refused=True` means DO NOT place the copy.

    `action` is the follower's side (already reversed for a reverse/hedge follower), `entry` the
    reference entry (the master's), `pip_value` money per pip per lot in the account currency.
    """
    try:
        entry, lots, balance = float(entry or 0), float(lots or 0), float(balance or 0)
        pip_size, pip_value, risk_pct = float(pip_size or 0), float(pip_value or 0), float(risk_pct)
    except (TypeError, ValueError):
        return None, "a number needed to set the stop could not be read", True
    if entry <= 0 or lots <= 0:
        return None, "no entry price or size to set the stop from", True
    if balance <= 0:
        return None, "your account balance is not synced yet, so a 1% stop cannot be set", True
    if pip_value <= 0 or pip_size <= 0:
        return None, "no reliable pip value for this symbol, so its risk cannot be limited", True

    allowed = balance * risk_pct / 100.0
    max_pips = allowed / (lots * pip_value)
    if max_pips < MIN_STOP_PIPS:
        return None, (f"at {lots} lots a {risk_pct:g}% stop would sit {max_pips:.2f} pips from entry "
                      f"— inside the spread; the trade is too big for your risk setting"), True
    digits = max(0, len(f"{pip_size:.10f}".rstrip("0").split(".")[1]) + 1)

    if master_sl:
        m = float(master_sl)
        if _on_stop_side(action, entry, m):
            m_pips = abs(entry - m) / pip_size
            m_pct = m_pips * lots * pip_value / balance * 100
            if m_pips <= max_pips:
                return round(m, digits), f"master's stop kept ({m_pct:.2f}% of your balance)", False
            stop = entry - max_pips * pip_size if action == "BUY" else entry + max_pips * pip_size
            return round(stop, digits), (f"master's stop would risk {m_pct:.2f}% — moved to "
                                         f"{risk_pct:g}% of your balance"), False
    stop = entry - max_pips * pip_size if action == "BUY" else entry + max_pips * pip_size
    return round(stop, digits), f"master had no stop — set at {risk_pct:g}% of your balance", False


def relative_levels(action: str, ref_price, sl, tp) -> tuple[int | None, int | None, str]:
    """A MARKET order's stop and target as DISTANCES (1/100000 of price), as cTrader requires.

    Spotware, ProtoOANewOrderReq: absolute `stopLoss`/`takeProfit` are "Not supported for MARKET
    orders"; `relativeStopLoss` is "Specified in 1/100000 of unit of a price" and "For BUY stopLoss =
    entryPrice - relativeStopLoss, for SELL stopLoss = entryPrice + relativeStopLoss".
    Returns (rel_sl, rel_tp, why) — a non-empty `why` means refuse the order rather than send it
    without the stop it was meant to carry.
    """
    if not sl and not tp:
        return None, None, ""
    try:
        ref = float(ref_price or 0)
    except (TypeError, ValueError):
        ref = 0.0
    if ref <= 0:
        return None, None, "no reference price to turn the stop into a distance — not sent"

    def dist(level, want_below: bool):
        lv = float(level)
        if (lv < ref) != want_below or lv == ref:
            return None
        return int(round(abs(ref - lv) * 100000))

    rel_sl = rel_tp = None
    if sl:
        rel_sl = dist(sl, want_below=(action == "BUY"))
        if not rel_sl:
            return None, None, f"stop {sl} is on the wrong side of {ref} for a {action} — not sent"
    if tp:
        rel_tp = dist(tp, want_below=(action != "BUY"))
        if not rel_tp:
            return None, None, f"target {tp} is on the wrong side of {ref} for a {action} — not sent"
    return rel_sl, rel_tp, ""


def reduce_lots(open_vol, fraction) -> float | None:
    """The follower's share of a master's partial close: the same fraction of what the follower holds.

    Rounded to the 0.01-lot step and at least 0.01. None when there is nothing to reduce. If rounding
    would leave less than 0.01 open, the whole remainder is closed rather than stranding dust.
    """
    try:
        v, f = float(open_vol or 0), float(fraction or 0)
    except (TypeError, ValueError):
        return None
    if v <= 0 or f <= 0:
        return None
    lots = max(0.01, round(v * min(f, 1.0), 2))
    if v - lots < 0.01:
        lots = round(v, 2)
    return lots
