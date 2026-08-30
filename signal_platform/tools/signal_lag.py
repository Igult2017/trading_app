"""HOW LATE ARE THE SIGNALS? Reads the recorded lag back and prints the arithmetic.

    python signal_platform/tools/signal_lag.py            # last 7 days
    python signal_platform/tools/signal_lag.py "2 days"
    python signal_platform/tools/signal_lag.py "4 weeks" vix1

WHY IT EXISTS. He said *"signal arrives late when its past entry"*, and against real broker M1 bars
he was right: all four stored signals were at or past their own entry when they fired, two of them
genuinely through it. But that answer took a bespoke investigation, mixed the market's own waiting
time with the platform's, and rested on four signals because four was all that existed to measure.

`strategy_runner.data_lag` now stamps the platform's own share onto every BUILT row. This reads it
back, so "is it still late?" is a command rather than an argument.

WHAT THE NUMBER IS: seconds between the freshest bar CLOSING and the signal being built, on the
finest timeframe the strategy holds — the timeframe the entry is read off. It is OUR delay. It does
NOT include the market's own waiting (a 1M entry legitimately takes minutes to form), so a small lag
with a late signal means the strategy was waiting, not that the platform was slow.

READ-ONLY. It queries the admin events endpoint and prints; it changes nothing.
"""
import json
import os
import re
import statistics
import sys
import urllib.parse          # explicit: relying on urllib.request to pull it in is fragile
import urllib.request

DEFAULT_SINCE = "7 days"


def _admin() -> tuple[str, str]:
    """(node_url, admin_secret) from the environment, or from the deployment if not set locally."""
    node = os.getenv("NODE_API_URL", "https://www.fsdzones.cloud")
    secret = os.getenv("ADMIN_SECRET", "")
    if secret:
        return node, secret
    sys.exit("Set ADMIN_SECRET (and optionally NODE_API_URL) in the environment first.")


def main() -> None:
    since = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SINCE
    strategy = sys.argv[2] if len(sys.argv) > 2 else ""
    node, secret = _admin()

    url = (f"{node}/api/admin/signal-events?limit=1000&stage=built"
           f"&since={urllib.parse.quote(since)}")
    if strategy:
        url += f"&strategy={strategy}"
    rows = json.load(urllib.request.urlopen(
        urllib.request.Request(url, headers={"x-admin-secret": secret}), timeout=60))

    lags: list[tuple[str, str, float, str]] = []
    unstamped = 0
    for r in rows:
        m = re.search(r"lag=(-?[\d.]+)s\(([A-Z0-9]+)\)", r.get("detail") or "")
        if not m:
            unstamped += 1
            continue
        lags.append((r["created_at"][:19], r["symbol"], float(m.group(1)), m.group(2)))

    print(f"\n   {len(rows)} signals built in the last {since}"
          + (f" for {strategy}" if strategy else ""))
    if unstamped:
        # Rows written before the stamp shipped, or where the context could not be read. Named rather
        # than quietly dropped — an average over an unknown denominator is how a wrong number is born.
        print(f"   {unstamped} of them carry NO lag stamp (built before it shipped, or unreadable)")
    if not lags:
        print("   nothing to measure yet.\n")
        return

    v = sorted(x[2] for x in lags)
    print(f"\n   PLATFORM DELAY — bar closed to signal built, {len(v)} signals")
    print(f"      median {statistics.median(v):6.1f}s")
    print(f"      worst  {max(v):6.1f}s        best {min(v):6.1f}s")
    over = [x for x in v if x > 20]
    print(f"      over 20s: {len(over)} ({len(over) / len(v) * 100:.0f}%)")

    print(f"\n   SLOWEST 10")
    for when, sym, lag, tf in sorted(lags, key=lambda x: -x[2])[:10]:
        print(f"      {when}  {sym:<8} {lag:6.1f}s  ({tf})")

    print(f"\n   WHAT THIS DOES AND DOES NOT SAY. It is the platform's own delay only. A 1M entry")
    print(f"   legitimately takes minutes to form, and that waiting is NOT in this number — so a")
    print(f"   small lag beside a late-feeling signal means the strategy was waiting, not that we")
    print(f"   were slow. Before 2026-08-30 this was 30-60s by design (the scan landed wherever it")
    print(f"   landed); scanning on the bar close should put the median in single figures.\n")


if __name__ == "__main__":
    main()
