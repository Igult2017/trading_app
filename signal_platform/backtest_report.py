"""
Backtest outcome simulation and reporting.
"""
from core.types import Candle


def simulate_outcomes(signals_by_month: dict, h1: list[Candle], max_bars: int = 120) -> None:
    """
    Walk forward through H1 closes with breakeven management:
    - Phase 1: initial SL active
    - Phase 2: 1R reached → SL moves to entry (breakeven)
    - Phase 3: 2R reached → TP

    Outcomes: TP (+2R), BE (0R), SL (-1R), open (still running at cutoff).
    """
    for sigs in signals_by_month.values():
        for s in sigs:
            start   = s["bar_idx"] + 1
            entry   = s["entry"]
            sl_init = s["sl"]
            tp      = s["tp"]
            buy     = s["dir"] == "BUY"
            risk    = abs(entry - sl_init)
            t1r     = entry + risk if buy else entry - risk

            cur_sl  = sl_init
            at_be   = False
            outcome = "open"

            for j, c in enumerate(h1[start: start + max_bars]):
                if not at_be:
                    if (buy and c.close >= t1r) or (not buy and c.close <= t1r):
                        cur_sl = entry
                        at_be  = True

                tp_hit = c.close >= tp      if buy else c.close <= tp
                sl_hit = c.close <= cur_sl  if buy else c.close >= cur_sl

                if tp_hit:
                    outcome = "TP"; break
                if sl_hit:
                    outcome = "BE" if at_be else "SL"; break

            s["outcome"]       = outcome
            s["bars_to_close"] = j + 1 if outcome != "open" else None


def report(signals_by_month: dict) -> None:
    months  = sorted(signals_by_month)
    all_sig = [s for m in months for s in signals_by_month[m]]
    total   = len(all_sig)
    wins    = [s for s in all_sig if s.get("outcome") == "TP"]
    bes     = [s for s in all_sig if s.get("outcome") == "BE"]
    losses  = [s for s in all_sig if s.get("outcome") == "SL"]
    open_   = [s for s in all_sig if s.get("outcome") == "open"]
    closed  = len(wins) + len(bes) + len(losses)
    wr      = len(wins) / closed * 100 if closed else 0
    pnl_r   = len(wins) * 2.0 + len(losses) * -1.0
    n_mon   = max(len(months), 1)

    print("\n=== Monthly Signal Count ===")
    print(f"{'Month':<12}  {'Sig':>4}  {'TP':>4}  {'BE':>4}  {'SL':>4}  {'Open':>5}")
    print("-" * 46)
    for m in months:
        sigs = signals_by_month[m]
        w = sum(1 for s in sigs if s.get("outcome") == "TP")
        b = sum(1 for s in sigs if s.get("outcome") == "BE")
        l = sum(1 for s in sigs if s.get("outcome") == "SL")
        o = sum(1 for s in sigs if s.get("outcome") == "open")
        print(f"{m:<12}  {len(sigs):>4}  {w:>4}  {b:>4}  {l:>4}  {o:>5}")
    print("-" * 46)
    print(f"Total  {total} signals  |  {len(wins)} TP  {len(bes)} BE  {len(losses)} SL  {len(open_)} open")
    print(f"Win rate (TP only):     {wr:.0f}%")
    print(f"P&L (in R):            {pnl_r:+.1f}R  over {closed} closed trades")
    print(f"Avg signals per month: {total / n_mon:.1f}")

    print("\n=== Signal Detail ===")
    icons = {"TP": "[TP]", "BE": "[BE]", "SL": "[SL]", "open": "[???]"}
    for m in months:
        print(f"\n  {m}:")
        for s in signals_by_month[m]:
            icon = icons.get(s.get("outcome", "open"), "")
            hrs  = f"  ({s['bars_to_close']}h)" if s.get("bars_to_close") else ""
            print(f"    {icon} [{s['date']} UTC] {s['dir']:4}  entry={s['entry']}"
                  f"  sl={s['sl']}  tp={s['tp']}{hrs}")
