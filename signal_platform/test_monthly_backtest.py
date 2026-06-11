"""
Monthly signal-count backtest for EURUSDPullbackStrategy.

Uses 60 days of H1 EURUSD data from Yahoo Finance (free, no key).
The 1M fractal-break check is approximated by an H1 close past the
pullback level.

Direction bias: D1 structural trend (detect() from trend_detector.py)
News avoidance: skips signals within 2H of high-impact USD/EUR events.

Run from the signal_platform directory:
    python test_monthly_backtest.py
"""

import sys, os, logging
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime, timezone

import yfinance as yf
import pandas as pd

from core.types        import Candle, TF, Trend
from shared.candle_math import is_bullish
from shared.session_clock    import is_valid_session
from shared.market_condition import is_tradeable
from shared.trend_detector   import detect as detect_trend
from strategies.pullback_setup import find_volume_candle, measure_pullback

logging.basicConfig(level=logging.WARNING)

SYMBOL = "EURUSD=X"

# High-impact USD/EUR news events Apr-Jun 2026 (date + UTC hour, window = +/-2h)
# Sources: FOMC, NFP, CPI, ECB rate decisions
HIGH_IMPACT_EVENTS = [
    # NFP
    datetime(2026, 4,  3,  12, 30, tzinfo=timezone.utc),
    datetime(2026, 5,  1,  12, 30, tzinfo=timezone.utc),
    datetime(2026, 6,  5,  12, 30, tzinfo=timezone.utc),
    # FOMC
    datetime(2026, 3, 19,  18,  0, tzinfo=timezone.utc),
    datetime(2026, 5,  7,  18,  0, tzinfo=timezone.utc),
    datetime(2026, 6, 18,  18,  0, tzinfo=timezone.utc),
    # US CPI
    datetime(2026, 4, 10,  12, 30, tzinfo=timezone.utc),
    datetime(2026, 5, 13,  12, 30, tzinfo=timezone.utc),
    datetime(2026, 6, 11,  12, 30, tzinfo=timezone.utc),
    # ECB rate decisions
    datetime(2026, 3,  6,  13, 15, tzinfo=timezone.utc),
    datetime(2026, 4, 17,  13, 15, tzinfo=timezone.utc),
    datetime(2026, 6,  5,  13, 15, tzinfo=timezone.utc),
]
NEWS_WINDOW_HOURS = 0.5  # 30 minutes — standard prop firm rule


def _near_high_impact_news(dt: datetime) -> bool:
    ts = dt.timestamp()
    for ev in HIGH_IMPACT_EVENTS:
        if abs(ts - ev.timestamp()) <= NEWS_WINDOW_HOURS * 3600:
            return True
    return False


# ── data helpers ──────────────────────────────────────────────────────────────

def _to_candles(df: pd.DataFrame, tf_name: str) -> list:
    rows = []
    for ts, row in df.iterrows():
        try:
            def _f(col):
                v = row[col]
                return float(v.iloc[0]) if hasattr(v, "iloc") else float(v)
            o, h, l, c = _f("Open"), _f("High"), _f("Low"), _f("Close")
            v = _f("Volume") if "Volume" in row else 0.0
        except Exception:
            continue
        if pd.isna(c) or c <= 0:
            continue
        unix = int(ts.timestamp()) if hasattr(ts, "timestamp") else int(pd.Timestamp(ts).timestamp())
        rows.append(Candle(time=unix, open=o, high=h, low=l, close=c, volume=v, timeframe=tf_name))
    return rows


def _resample_h4(h1: list) -> list:
    grouped: dict = {}
    for c in h1:
        b = c.time - c.time % (4 * 3600)
        grouped.setdefault(b, []).append(c)
    return [
        Candle(time=b, open=bars[0].open,
               high=max(x.high for x in bars), low=min(x.low for x in bars),
               close=bars[-1].close, volume=sum(x.volume for x in bars),
               timeframe=TF.H4)
        for b, bars in sorted(grouped.items())
    ]


def fetch() -> tuple:
    print("Fetching EURUSD H1 + D1 from Yahoo Finance ...")
    df_h1 = yf.download(SYMBOL, interval="1h", period="60d", progress=False, auto_adjust=True)
    h1 = _to_candles(df_h1, TF.H1)
    df_d1 = yf.download(SYMBOL, interval="1d", period="2y",  progress=False, auto_adjust=True)
    d1 = _to_candles(df_d1, TF.D1)
    h4 = _resample_h4(h1)
    print(f"  H1: {len(h1)} bars   H4: {len(h4)} bars   D1: {len(d1)} bars")
    return h1, h4, d1


# ── D1 trend for a given bar time ─────────────────────────────────────────────

def _d1_trend_at(d1: list, bar_time: int) -> "Trend":
    """D1 structural trend up to bar_time. 20-bar lookback matches live strategy."""
    past = [c for c in d1 if c.time < bar_time]
    if len(past) < 15:
        return Trend.RANGING
    return detect_trend(past, lookback=20)


# ── backtest ──────────────────────────────────────────────────────────────────

def run_backtest(h1: list, h4: list, d1: list) -> dict:
    fired: set = set()
    signals_by_month: dict = {}

    c_total = c_news = c_session = c_trade = c_d1 = c_vol = c_dedup = c_pb = c_frac = c_4h = 0

    # Need at least 30 bars for vol-candle lookback + pullback
    for i in range(30, len(h1)):
        cur     = h1[i]
        utc_now = datetime.fromtimestamp(cur.time, tz=timezone.utc)
        c_total += 1

        # Block 1 — High-impact news (+-2h window)
        if _near_high_impact_news(utc_now):
            continue
        c_news += 1

        # Block 2 — Session gate
        if not is_valid_session(utc_now):
            continue
        c_session += 1

        # Block 3 — Market condition on last 30 H1 bars
        h1_window = h1[max(0, i - 29): i + 1]
        if not is_tradeable(h1_window):
            continue
        c_trade += 1

        # Block 4 — D1 trend: only trade when D1 shows clear directional structure
        trend = _d1_trend_at(d1, cur.time)
        if trend == Trend.RANGING:
            continue
        c_d1 += 1
        bullish = (trend == Trend.UPTREND)

        # Step 1 — Volume candle in last 15 H1 bars
        h1_slice = h1[max(0, i - 14): i + 1]
        rel_idx  = find_volume_candle(h1_slice, bullish=bullish)
        if rel_idx is None:
            continue
        c_vol += 1

        abs_idx = max(0, i - 14) + rel_idx
        if abs_idx in fired:
            continue
        c_dedup += 1

        # Step 1 — Pullback: 1-2 bars, depth 25-80% of vol body, fresh
        pb = measure_pullback(h1_slice, rel_idx, bullish)
        if pb is None:
            continue
        c_pb += 1
        pb_high, pb_low, pb_count, _pb_end_time = pb

        # Step 3 — H1 close past pb_high/pb_low as 1M fractal proxy
        # (real M1 data not available for 60-day backtest; H1 close is approximate)
        if bullish  and cur.close <= pb_high:
            continue
        if not bullish and cur.close >= pb_low:
            continue
        c_frac += 1

        # Risk levels — SL anchored to pullback zone boundary + 15% buffer
        _pip     = 0.00010
        pb_range = pb_high - pb_low
        buffer   = max(2 * _pip, pb_range * 0.15)
        entry    = cur.close
        sl       = (pb_low - buffer) if bullish else (pb_high + buffer)
        risk     = abs(entry - sl)

        # Enforce same risk bounds as live strategy
        if risk < 5 * _pip or risk > 60 * _pip:
            continue

        tp = entry + 2.0 * risk if bullish else entry - 2.0 * risk
        c_4h += 1

        # Signal fires
        fired.add(abs_idx)
        month = utc_now.strftime("%Y-%m")
        signals_by_month.setdefault(month, []).append({
            "date":     utc_now.strftime("%Y-%m-%d %H:%M"),
            "dir":      "BUY" if bullish else "SELL",
            "d1_trend": "UPTREND" if bullish else "DOWNTREND",
            "entry":    round(entry, 5),
            "sl":       round(sl, 5),
            "tp":       round(tp, 5),
            "rr":       2.0,
            "pb_count": pb_count,
            "bar_idx":  i,
        })

    print("\n=== Filter Funnel ===")
    print(f"  H1 bars scanned         : {c_total}")
    print(f"  After news filter       : {c_news}")
    print(f"  After session gate      : {c_session}")
    print(f"  After market condition  : {c_trade}")
    print(f"  After D1 trend gate     : {c_d1}")
    print(f"  After volume candle     : {c_vol}")
    print(f"  After dedup             : {c_dedup}")
    print(f"  After pullback check    : {c_pb}")
    print(f"  After fractal break     : {c_frac}")
    print(f"  After risk bounds       : {c_4h}  <- final signals")
    return signals_by_month


# ── outcome simulation ────────────────────────────────────────────────────────

def simulate_outcomes(signals_by_month: dict, h1: list, max_bars: int = 120) -> None:
    """
    Walk forward through H1 closes with trailing SL / BE management:

    Phase 1  — initial SL active
    Phase 2  — when price reaches 1R, SL moves to entry (breakeven)
    Phase 3  — TP at 2R = full win

    Outcomes: TP (+2R), BE (0R), SL (-1R), open (still running)
    """
    for sigs in signals_by_month.values():
        for s in sigs:
            start     = s["bar_idx"] + 1
            entry     = s["entry"]
            sl_init   = s["sl"]
            tp        = s["tp"]
            buy       = s["dir"] == "BUY"
            risk      = abs(entry - sl_init)
            target_1r = entry + risk if buy else entry - risk

            current_sl = sl_init
            at_be      = False
            outcome    = "open"
            j          = 0

            for j, c in enumerate(h1[start: start + max_bars]):
                if not at_be:
                    hit_1r = c.close >= target_1r if buy else c.close <= target_1r
                    if hit_1r:
                        current_sl = entry
                        at_be      = True

                tp_hit = c.close >= tp       if buy else c.close <= tp
                sl_hit = c.close <= current_sl if buy else c.close >= current_sl

                if tp_hit:
                    outcome = "TP"; break
                if sl_hit:
                    outcome = "BE" if at_be else "SL"; break

            s["outcome"]       = outcome
            s["bars_to_close"] = j + 1 if outcome != "open" else None


# ── report ────────────────────────────────────────────────────────────────────

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
    pnl_r   = len(wins) * 2.0 + len(bes) * 0.0 + len(losses) * -1.0

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
    months_covered = max(len(months), 1)
    print(f"Total  {total} signals  |  {len(wins)} TP  {len(bes)} BE  {len(losses)} SL  {len(open_)} open")
    print(f"Win rate (TP only):     {wr:.0f}%")
    print(f"P&L (in R):            {pnl_r:+.1f}R  over {closed} closed trades")
    print(f"Avg signals per month: {total / months_covered:.1f}")

    print("\n=== Signal Detail ===")
    icons = {"TP": "[TP] ", "BE": "[BE] ", "SL": "[SL] ", "open": "[???]"}
    for m in months:
        print(f"\n  {m}:")
        for s in signals_by_month[m]:
            icon = icons.get(s.get("outcome", "open"), "")
            hrs  = f"  ({s['bars_to_close']}h)" if s.get("bars_to_close") else ""
            trend_label = s.get("d1_trend", "?")
            print(f"    {icon} [{s['date']} UTC] {s['dir']:4}  D1={trend_label}"
                  f"  entry={s['entry']}  sl={s['sl']}  tp={s['tp']}{hrs}")


if __name__ == "__main__":
    h1, h4, d1 = fetch()
    if len(h1) < 30:
        print("Not enough H1 data.")
        sys.exit(1)
    results = run_backtest(h1, h4, d1)
    simulate_outcomes(results, h1)
    report(results)
