"""
Monthly signal-count backtest for EURUSDPullbackStrategy.

Uses 60 days of H1 EURUSD data from Yahoo Finance (free, no key).
The 1M fractal-break check is approximated by an H1 close past the
pullback level — acceptable proxy since a clean breakout H1 close is a
superset of any 1M close that preceded it.

Run from the signal_platform directory:
    python test_monthly_backtest.py
"""

import sys, os, asyncio, logging
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime, timezone

import yfinance as yf
import pandas as pd

from core.types        import Candle, MTFCandles, TF
from shared.candle_math import is_bullish
from shared.session_clock    import is_valid_session
from shared.market_condition import is_tradeable
from strategies.pullback_setup import find_volume_candle, measure_pullback, has_4h_obstruction

logging.basicConfig(level=logging.WARNING)

SYMBOL        = "EURUSD=X"
_EMA_CHOP_PCT = 0.0008
_EMA_K        = 2.0 / (200 + 1)


# ── data helpers ──────────────────────────────────────────────────────────────

def _to_candles(df: pd.DataFrame, tf_name: str) -> list[Candle]:
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


def _resample_h4(h1: list[Candle]) -> list[Candle]:
    grouped: dict[int, list[Candle]] = {}
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


def fetch() -> tuple[list[Candle], list[Candle]]:
    print("Fetching EURUSD H1 + D1 from Yahoo Finance ...")
    df_h1 = yf.download(SYMBOL, interval="1h", period="60d", progress=False, auto_adjust=True)
    h1 = _to_candles(df_h1, TF.H1)
    df_d1 = yf.download(SYMBOL, interval="1d", period="2y",  progress=False, auto_adjust=True)
    d1 = _to_candles(df_d1, TF.D1)
    h4 = _resample_h4(h1)
    print(f"  H1: {len(h1)} bars   H4: {len(h4)} bars   D1: {len(d1)} bars")
    return h1, h4, d1


# ── incremental EMA ───────────────────────────────────────────────────────────

def build_ema_series(h1: list[Candle]) -> list[float]:
    ema = h1[0].close
    out = []
    for c in h1:
        ema = c.close * _EMA_K + ema * (1 - _EMA_K)
        out.append(ema)
    return out


# ── backtest ──────────────────────────────────────────────────────────────────

def run_backtest(h1: list[Candle], h4: list[Candle]) -> dict[str, list[dict]]:
    ema_series = build_ema_series(h1)
    fired: set[int] = set()          # absolute vol_idx already used
    signals_by_month: dict[str, list[dict]] = {}
    # filter counters
    c_total = c_ema = c_session = c_trade = c_vol = c_pb = c_frac = c_dedup = c_4h = 0

    # Need at least 215 bars: 200 EMA warm-up + 15 lookback
    for i in range(215, len(h1)):
        cur      = h1[i]
        ema_val  = ema_series[i]
        price    = cur.close
        bias     = "bullish" if price > ema_val else "bearish"
        dist_pct = abs(price - ema_val) / ema_val

        c_total += 1
        # EMA gate
        if dist_pct < _EMA_CHOP_PCT:
            continue
        c_ema += 1
        bullish = (bias == "bullish")

        # Session gate
        utc_now = datetime.fromtimestamp(cur.time, tz=timezone.utc)
        if not is_valid_session(utc_now):
            continue
        c_session += 1

        # Market condition on last 30 H1 bars
        h1_window = h1[max(0, i - 29): i + 1]
        if not is_tradeable(h1_window):
            continue
        c_trade += 1

        # Volume candle in last 15 confirmed H1 bars
        h1_slice = h1[max(0, i - 14): i + 1]
        rel_idx  = find_volume_candle(h1_slice, bullish=bullish)
        if rel_idx is None:
            continue
        c_vol += 1

        abs_idx = max(0, i - 14) + rel_idx
        if abs_idx in fired:
            continue
        c_dedup += 1

        # Pullback immediately after the volume candle
        pb = measure_pullback(h1_slice, rel_idx, bullish)
        if pb is None:
            continue
        c_pb += 1
        pb_high, pb_low, pb_count = pb

        # H1 fractal-break proxy: current bar closed past the pullback level
        if bullish  and cur.close <= pb_high:
            continue
        if not bullish and cur.close >= pb_low:
            continue
        c_frac += 1

        # Risk levels
        entry  = cur.close
        zone   = (pb_high - pb_low) * 0.10
        sl     = (pb_low  - zone) if bullish else (pb_high + zone)
        risk   = abs(entry - sl)
        if risk <= 0:
            continue
        tp = entry + 2.0 * risk if bullish else entry - 2.0 * risk

        # 4H obstruction — last 50 H4 bars up to signal time (~8 days).
        # Mitigation is checked inside has_4h_obstruction; stale levels
        # that price has already closed through are automatically skipped.
        h4_ts   = cur.time
        h4_past = [c for c in h4 if c.time <= h4_ts][-50:]
        if has_4h_obstruction(h4_past, entry, bullish, risk):
            continue
        c_4h += 1

        # ── Signal fires ──────────────────────────────────────────────────
        fired.add(abs_idx)
        month = utc_now.strftime("%Y-%m")
        signals_by_month.setdefault(month, []).append({
            "date":      utc_now.strftime("%Y-%m-%d %H:%M"),
            "dir":       "BUY" if bullish else "SELL",
            "entry":     round(entry, 5),
            "sl":        round(sl, 5),
            "tp":        round(tp, 5),
            "rr":        2.0,
            "pb_count":  pb_count,
            "ema_dist":  round(dist_pct * 100, 3),
            "bar_idx":   i,          # used for outcome simulation
        })

    print("\n=== Filter Funnel ===")
    print(f"  H1 bars scanned         : {c_total}")
    print(f"  After EMA 200 gate      : {c_ema}")
    print(f"  After session gate      : {c_session}")
    print(f"  After market condition  : {c_trade}")
    print(f"  After volume candle     : {c_vol}")
    print(f"  After dedup (new setup) : {c_dedup}")
    print(f"  After pullback check    : {c_pb}")
    print(f"  After fractal break     : {c_frac}")
    print(f"  After 4H obstruction    : {c_4h}  <- final signals")

    return signals_by_month


# ── outcome simulation ────────────────────────────────────────────────────────

def simulate_outcomes(signals_by_month: dict[str, list[dict]],
                      h1: list[Candle],
                      max_bars: int = 120) -> None:
    """
    Walk forward through H1 CLOSES for each signal (up to max_bars = 5 days).

    Close-based logic avoids the wick problem: H1 candles regularly span
    30-50 pips and would falsely trigger 8-pip SLs using high/low.
    A close past a level is the honest signal that price has committed.

    BUY:  TP if close >= tp, SL if close <= sl
    SELL: TP if close <= tp, SL if close >= sl
    """
    for sigs in signals_by_month.values():
        for s in sigs:
            start   = s["bar_idx"] + 1
            sl, tp  = s["sl"], s["tp"]
            buy     = s["dir"] == "BUY"
            outcome = "open"
            bars    = 0

            for j, c in enumerate(h1[start: start + max_bars]):
                bars = j + 1
                tp_hit = c.close >= tp if buy else c.close <= tp
                sl_hit = c.close <= sl if buy else c.close >= sl

                if tp_hit:
                    outcome = "TP"
                    break
                if sl_hit:
                    outcome = "SL"
                    break

            s["outcome"]       = outcome
            s["bars_to_close"] = bars if outcome != "open" else None


# ── report ────────────────────────────────────────────────────────────────────

def report(signals_by_month: dict[str, list[dict]]) -> None:
    months  = sorted(signals_by_month)
    all_sig = [s for m in months for s in signals_by_month[m]]
    total   = len(all_sig)
    wins    = [s for s in all_sig if s.get("outcome") == "TP"]
    losses  = [s for s in all_sig if s.get("outcome") == "SL"]
    open_   = [s for s in all_sig if s.get("outcome") == "open"]
    wr      = len(wins) / (len(wins) + len(losses)) * 100 if (wins or losses) else 0

    print("\n=== Monthly Signal Count ===")
    print(f"{'Month':<12}  {'Signals':>7}  {'W':>4}  {'L':>4}  {'Open':>5}")
    print("-" * 42)
    for m in months:
        sigs = signals_by_month[m]
        w = sum(1 for s in sigs if s.get("outcome") == "TP")
        l = sum(1 for s in sigs if s.get("outcome") == "SL")
        o = sum(1 for s in sigs if s.get("outcome") == "open")
        print(f"{m:<12}  {len(sigs):>7}  {w:>4}  {l:>4}  {o:>5}")
    print("-" * 42)
    months_covered = max(len(months), 1)
    print(f"Total   {total} signals  |  {len(wins)}W  {len(losses)}L  {len(open_)} open")
    print(f"Win rate (closed trades): {wr:.0f}%")
    print(f"Avg per month: {total / months_covered:.1f}")

    print("\n=== Signal Detail ===")
    icons = {"TP": "[WIN]", "SL": "[LOSS]", "open": "[OPEN]"}
    for m in months:
        print(f"\n  {m}:")
        for s in signals_by_month[m]:
            icon  = icons.get(s.get("outcome", "open"), "")
            bars  = f"  ({s['bars_to_close']}h)" if s.get("bars_to_close") else ""
            print(f"    {icon:<6} [{s['date']} UTC] {s['dir']:4}  "
                  f"entry={s['entry']}  sl={s['sl']}  tp={s['tp']}{bars}")


if __name__ == "__main__":
    h1, h4, d1 = fetch()
    if len(h1) < 215:
        print("Not enough H1 data.")
        sys.exit(1)
    results = run_backtest(h1, h4)
    simulate_outcomes(results, h1)
    report(results)
