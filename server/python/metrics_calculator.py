import sys
import json
from collections import defaultdict


def safe_float(val, default=0.0):
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def compute_core_metrics(trades):
    total = len(trades)
    if total == 0:
        return {
            "totalTrades": 0, "totalPL": 0, "winRate": 0, "lossRate": 0,
            "profitFactor": 0, "avgRR": 0, "expectancy": 0,
            "wins": 0, "losses": 0, "breakeven": 0,
        }

    wins = [t for t in trades if (t.get("outcome") or "").lower() == "win"]
    losses = [t for t in trades if (t.get("outcome") or "").lower() == "loss"]
    breakeven = [t for t in trades if (t.get("outcome") or "").lower() == "breakeven"]

    total_pl = sum(safe_float(t.get("profitLoss")) for t in trades)
    gross_profit = sum(safe_float(t.get("profitLoss")) for t in wins)
    gross_loss = abs(sum(safe_float(t.get("profitLoss")) for t in losses))

    win_rate = (len(wins) / total * 100) if total > 0 else 0
    loss_rate = (len(losses) / total * 100) if total > 0 else 0
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (999.0 if gross_profit > 0 else 0)

    rr_values = [safe_float(t.get("riskReward")) for t in trades if t.get("riskReward") is not None]
    avg_rr = (sum(rr_values) / len(rr_values)) if rr_values else 0

    avg_win = (gross_profit / len(wins)) if wins else 0
    avg_loss = (gross_loss / len(losses)) if losses else 0
    expectancy = (win_rate / 100 * avg_win) - (loss_rate / 100 * avg_loss)

    return {
        "totalTrades": total, "totalPL": round(total_pl, 2),
        "winRate": round(win_rate, 1), "lossRate": round(loss_rate, 1),
        "profitFactor": round(profit_factor, 2), "avgRR": round(avg_rr, 2),
        "expectancy": round(expectancy, 2),
        "wins": len(wins), "losses": len(losses), "breakeven": len(breakeven),
        "grossProfit": round(gross_profit, 2), "grossLoss": round(gross_loss, 2),
        "avgWin": round(avg_win, 2), "avgLoss": round(avg_loss, 2),
    }


def compute_streaks(trades):
    sorted_trades = sorted(trades, key=lambda t: t.get("entryTime") or t.get("createdAt") or "")
    max_win_streak = max_loss_streak = current_win = current_loss = 0
    current_streak_type = None
    current_streak_count = 0

    for t in sorted_trades:
        outcome = (t.get("outcome") or "").lower()
        if outcome == "win":
            current_win += 1
            current_loss = 0
            max_win_streak = max(max_win_streak, current_win)
        elif outcome == "loss":
            current_loss += 1
            current_win = 0
            max_loss_streak = max(max_loss_streak, current_loss)
        else:
            current_win = current_loss = 0

        if outcome in ("win", "loss"):
            if outcome == current_streak_type:
                current_streak_count += 1
            else:
                current_streak_type = outcome
                current_streak_count = 1

    loss_sequences = []
    seq = []
    for t in sorted_trades:
        outcome = (t.get("outcome") or "").lower()
        if outcome == "loss":
            seq.append(safe_float(t.get("profitLoss")))
        else:
            if seq:
                loss_sequences.append(seq)
            seq = []
    if seq:
        loss_sequences.append(seq)

    max_drawdown = min((sum(s) for s in loss_sequences), default=0)
    avg_recovery = len(loss_sequences)

    return {
        "maxWinStreak": max_win_streak, "maxLossStreak": max_loss_streak,
        "currentStreakType": current_streak_type, "currentStreakCount": current_streak_count,
        "maxDrawdown": round(max_drawdown, 2), "recoverySequences": avg_recovery,
    }


def compute_session_breakdown(trades):
    sessions = defaultdict(lambda: {"trades": 0, "wins": 0, "pl": 0.0})
    for t in trades:
        s = t.get("sessionName") or "Unknown"
        sessions[s]["trades"] += 1
        sessions[s]["pl"] += safe_float(t.get("profitLoss"))
        if (t.get("outcome") or "").lower() == "win":
            sessions[s]["wins"] += 1

    result = {}
    for name, data in sessions.items():
        result[name] = {
            "trades": data["trades"],
            "wins": data["wins"],
            "winRate": round(data["wins"] / data["trades"] * 100, 1) if data["trades"] > 0 else 0,
            "pl": round(data["pl"], 2),
        }
    return result


def compute_instrument_breakdown(trades):
    instruments = defaultdict(lambda: {"trades": 0, "wins": 0, "pl": 0.0})
    for t in trades:
        inst = t.get("instrument") or "Unknown"
        instruments[inst]["trades"] += 1
        instruments[inst]["pl"] += safe_float(t.get("profitLoss"))
        if (t.get("outcome") or "").lower() == "win":
            instruments[inst]["wins"] += 1

    result = {}
    for name, data in instruments.items():
        result[name] = {
            "trades": data["trades"],
            "wins": data["wins"],
            "winRate": round(data["wins"] / data["trades"] * 100, 1) if data["trades"] > 0 else 0,
            "pl": round(data["pl"], 2),
        }
    return result


def compute_direction_bias(trades):
    longs = [t for t in trades if (t.get("direction") or "").lower() == "long"]
    shorts = [t for t in trades if (t.get("direction") or "").lower() == "short"]

    def stats(subset):
        total = len(subset)
        wins = sum(1 for t in subset if (t.get("outcome") or "").lower() == "win")
        pl = sum(safe_float(t.get("profitLoss")) for t in subset)
        return {"trades": total, "wins": wins, "winRate": round(wins / total * 100, 1) if total > 0 else 0, "pl": round(pl, 2)}

    return {"long": stats(longs), "short": stats(shorts)}


def compute_exit_analysis(trades):
    reasons = defaultdict(lambda: {"count": 0, "wins": 0, "pl": 0.0})
    for t in trades:
        reason = t.get("primaryExitReason") or "Unknown"
        reasons[reason]["count"] += 1
        reasons[reason]["pl"] += safe_float(t.get("profitLoss"))
        if (t.get("outcome") or "").lower() == "win":
            reasons[reason]["wins"] += 1

    result = {}
    for reason, data in reasons.items():
        result[reason] = {
            "count": data["count"],
            "wins": data["wins"],
            "winRate": round(data["wins"] / data["count"] * 100, 1) if data["count"] > 0 else 0,
            "pl": round(data["pl"], 2),
        }
    return result


def compute_risk_metrics(trades):
    risk_percents = [safe_float(t.get("riskPercent")) for t in trades if t.get("riskPercent") is not None]
    avg_risk = (sum(risk_percents) / len(risk_percents)) if risk_percents else 0
    max_risk = max(risk_percents) if risk_percents else 0

    mae_values = [safe_float(t.get("mae")) for t in trades if t.get("mae") is not None]
    mfe_values = [safe_float(t.get("mfe")) for t in trades if t.get("mfe") is not None]

    return {
        "avgRiskPercent": round(avg_risk, 2), "maxRiskPercent": round(max_risk, 2),
        "avgMAE": round(sum(mae_values) / len(mae_values), 2) if mae_values else 0,
        "avgMFE": round(sum(mfe_values) / len(mfe_values), 2) if mfe_values else 0,
        "rulesAdherence": compute_rules_adherence(trades),
    }


def compute_rules_adherence(trades):
    if not trades:
        return 0
    compliant = 0
    for t in trades:
        has_sl = t.get("stopLoss") is not None
        has_tp = t.get("takeProfit") is not None
        has_entry = t.get("entryPrice") is not None
        if has_sl and has_tp and has_entry:
            compliant += 1
    return round(compliant / len(trades) * 100, 1)


def compute_equity_curve(trades, starting_balance=None):
    sorted_trades = sorted(trades, key=lambda t: t.get("entryTime") or t.get("createdAt") or "")
    curve = []
    cumulative = 0.0
    balance = starting_balance if starting_balance else 0.0

    for i, t in enumerate(sorted_trades):
        risk_pct = safe_float(t.get("riskPercent"))
        outcome = (t.get("outcome") or "").lower()
        pl = safe_float(t.get("profitLoss"))

        if starting_balance and risk_pct > 0:
            risk_amount = balance * (risk_pct / 100.0)
            achieved_rr = safe_float(t.get("achievedRR") or t.get("riskReward"))
            if outcome == "win" and achieved_rr > 0:
                change = risk_amount * achieved_rr
            elif outcome == "loss":
                change = -risk_amount
            else:
                change = pl
            balance += change
            cumulative += change
        else:
            cumulative += pl
            balance = (starting_balance + cumulative) if starting_balance else cumulative

        curve.append({
            "tradeNumber": i + 1,
            "cumulativePL": round(cumulative, 2),
            "balance": round(balance, 2),
            "date": t.get("entryTime") or t.get("createdAt") or "",
            "instrument": t.get("instrument") or "",
            "outcome": t.get("outcome") or "",
        })
    return curve


def compute_equity_growth(trades, starting_balance):
    if not starting_balance or starting_balance <= 0:
        return None
    curve = compute_equity_curve(trades, starting_balance)
    current_balance = curve[-1]["balance"] if curve else starting_balance
    total_pl = current_balance - starting_balance
    total_return_pct = (total_pl / starting_balance) * 100 if starting_balance > 0 else 0
    return {
        "startingBalance": round(starting_balance, 2),
        "currentBalance": round(current_balance, 2),
        "totalPL": round(total_pl, 2),
        "totalReturnPct": round(total_return_pct, 2),
        "balanceHistory": [{"trade": p["tradeNumber"], "balance": p["balance"], "date": p["date"]} for p in curve],
    }


def compute_strategy_performance(trades):
    manual_fields_strategies = defaultdict(lambda: {"trades": 0, "wins": 0, "pl": 0.0})
    for t in trades:
        manual = t.get("manualFields") or {}
        if isinstance(manual, str):
            try:
                manual = json.loads(manual)
            except (json.JSONDecodeError, TypeError):
                manual = {}
        strategy = manual.get("strategy") or manual.get("setup") or "Unclassified"
        manual_fields_strategies[strategy]["trades"] += 1
        manual_fields_strategies[strategy]["pl"] += safe_float(t.get("profitLoss"))
        if (t.get("outcome") or "").lower() == "win":
            manual_fields_strategies[strategy]["wins"] += 1

    result = {}
    for name, data in manual_fields_strategies.items():
        result[name] = {
            "trades": data["trades"],
            "wins": data["wins"],
            "winRate": round(data["wins"] / data["trades"] * 100, 1) if data["trades"] > 0 else 0,
            "pl": round(data["pl"], 2),
            "avgPL": round(data["pl"] / data["trades"], 2) if data["trades"] > 0 else 0,
        }
    return result


def compute_setup_frequency(trades):
    setups = defaultdict(int)
    for t in trades:
        manual = t.get("manualFields") or {}
        if isinstance(manual, str):
            try:
                manual = json.loads(manual)
            except (json.JSONDecodeError, TypeError):
                manual = {}
        setup = manual.get("setup") or manual.get("strategy") or "Unclassified"
        setups[setup] += 1
    return dict(setups)


def compute_trade_grades(trades):
    grades = {"A": 0, "B": 0, "C": 0, "D": 0, "F": 0}
    for t in trades:
        has_sl = t.get("stopLoss") is not None
        has_tp = t.get("takeProfit") is not None
        rr = safe_float(t.get("riskReward"))
        outcome = (t.get("outcome") or "").lower()
        is_win = outcome == "win"

        score = 0
        if has_sl:
            score += 1
        if has_tp:
            score += 1
        if rr >= 2:
            score += 1
        if is_win:
            score += 1
        if t.get("primaryExitReason") and t.get("primaryExitReason") != "Unknown":
            score += 1

        if score >= 5:
            grades["A"] += 1
        elif score >= 4:
            grades["B"] += 1
        elif score >= 3:
            grades["C"] += 1
        elif score >= 2:
            grades["D"] += 1
        else:
            grades["F"] += 1
    return grades


def compute_psychology_metrics(trades):
    if not trades:
        return {"discipline": 0, "patience": 0, "consistency": 0}

    discipline_scores = []
    for t in trades:
        score = 0
        if t.get("stopLoss") is not None:
            score += 33
        if t.get("takeProfit") is not None:
            score += 33
        exit_reason = (t.get("primaryExitReason") or "").lower()
        if exit_reason in ("target hit", "stop hit"):
            score += 34
        discipline_scores.append(score)

    rr_values = [safe_float(t.get("riskReward")) for t in trades if t.get("riskReward") is not None]
    patience = min(100, round(sum(1 for r in rr_values if r >= 1.5) / len(rr_values) * 100)) if rr_values else 0

    pls = [safe_float(t.get("profitLoss")) for t in trades]
    if len(pls) >= 2:
        mean_pl = sum(pls) / len(pls)
        variance = sum((p - mean_pl) ** 2 for p in pls) / len(pls)
        std_pl = variance ** 0.5
        consistency = max(0, min(100, round(100 - (std_pl / (abs(mean_pl) + 1)) * 10)))
    else:
        consistency = 50

    return {
        "discipline": round(sum(discipline_scores) / len(discipline_scores)) if discipline_scores else 0,
        "patience": patience,
        "consistency": consistency,
    }


def compute_day_of_week_breakdown(trades):
    days = defaultdict(lambda: {"trades": 0, "wins": 0, "pl": 0.0})
    for t in trades:
        day = t.get("dayOfWeek") or "Unknown"
        days[day]["trades"] += 1
        days[day]["pl"] += safe_float(t.get("profitLoss"))
        if (t.get("outcome") or "").lower() == "win":
            days[day]["wins"] += 1

    result = {}
    for day, data in days.items():
        result[day] = {
            "trades": data["trades"],
            "wins": data["wins"],
            "winRate": round(data["wins"] / data["trades"] * 100, 1) if data["trades"] > 0 else 0,
            "pl": round(data["pl"], 2),
        }
    return result


def compute_timeframe_breakdown(trades):
    tfs = defaultdict(lambda: {"trades": 0, "wins": 0, "pl": 0.0})
    for t in trades:
        tf = t.get("entryTF") or "Unknown"
        tfs[tf]["trades"] += 1
        tfs[tf]["pl"] += safe_float(t.get("profitLoss"))
        if (t.get("outcome") or "").lower() == "win":
            tfs[tf]["wins"] += 1

    result = {}
    for tf, data in tfs.items():
        result[tf] = {
            "trades": data["trades"],
            "wins": data["wins"],
            "winRate": round(data["wins"] / data["trades"] * 100, 1) if data["trades"] > 0 else 0,
            "pl": round(data["pl"], 2),
        }
    return result


def compute_all_metrics(trades, starting_balance=None):
    core = compute_core_metrics(trades)
    streaks = compute_streaks(trades)
    sessions = compute_session_breakdown(trades)
    instruments = compute_instrument_breakdown(trades)
    direction = compute_direction_bias(trades)
    exit_analysis = compute_exit_analysis(trades)
    risk = compute_risk_metrics(trades)
    equity_curve = compute_equity_curve(trades, starting_balance)
    strategy_perf = compute_strategy_performance(trades)
    setup_freq = compute_setup_frequency(trades)
    grades = compute_trade_grades(trades)
    psychology = compute_psychology_metrics(trades)
    day_breakdown = compute_day_of_week_breakdown(trades)
    tf_breakdown = compute_timeframe_breakdown(trades)

    result = {
        "core": core,
        "streaks": streaks,
        "sessionBreakdown": sessions,
        "instrumentBreakdown": instruments,
        "directionBias": direction,
        "exitAnalysis": exit_analysis,
        "riskMetrics": risk,
        "equityCurve": equity_curve,
        "strategyPerformance": strategy_perf,
        "setupFrequency": setup_freq,
        "tradeGrades": grades,
        "psychology": psychology,
        "dayOfWeekBreakdown": day_breakdown,
        "timeframeBreakdown": tf_breakdown,
    }

    if starting_balance:
        equity_growth = compute_equity_growth(trades, starting_balance)
        if equity_growth:
            result["equityGrowth"] = equity_growth

    return result


if __name__ == "__main__":
    try:
        raw = sys.stdin.read().strip()
        if not raw:
            print(json.dumps({"success": True, "metrics": compute_all_metrics([])}))
            sys.exit(0)
        data = json.loads(raw)
        if isinstance(data, list):
            trades = data
            starting_balance = None
        elif isinstance(data, dict):
            trades = data.get("trades", [])
            starting_balance = safe_float(data.get("startingBalance"), None)
        else:
            trades = []
            starting_balance = None
        metrics = compute_all_metrics(trades, starting_balance)
        print(json.dumps({"success": True, "metrics": metrics}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)
