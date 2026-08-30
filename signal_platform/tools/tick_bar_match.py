"""DO OUR TICK-BUILT CANDLES MATCH THE BROKER'S? The go / no-go for serving them.

    python signal_platform/tools/tick_bar_match.py

Prints the live scoreboard held in the running process. NOT for reading from another machine — it
reports THIS process's audit, so it is used from a shell inside the container, or by the platform
itself when it logs the summary.

WHAT IT IS ANSWERING. Not "is it faster" — that is arithmetic and already settled: a tick arrives as
it happens, the broker's candle arrives 10-70s later. The question is whether ours is the SAME
candle. A fast wrong candle is worse than a slow right one: the momentum test could pass when it
should not, or the line be drawn at the wrong level, and we would be trading faster onto wrong
numbers.

THE BAR TO CLEAR is the one the aggregator already cleared when H1 was first built from M1: open,
high, low and close identical **to the last decimal**, across all five instruments. Not "close
enough". Anything less and tick-built candles stay unserved.
"""
import sys


def main() -> None:
    sys.path.insert(0, ".")
    from data.tick_bar_audit import audit, MIN_SAMPLE
    from data.tick_bars import builder

    rows = audit.report()
    if not rows:
        print("\n   Nothing compared yet.")
        print("   Either the price stream is not running, or no broker M1 bar has landed since it")
        print("   started. Comparisons only happen when the broker publishes its own version of a")
        print("   minute we also built — which is 10-70s after that minute ends.\n")
        return

    print(f"\n   {'symbol':<10} {'compared':>9} {'matched':>8} {'recent':>7} {'clean':>6}  trusted")
    all_clean = True
    for sym in sorted(rows):
        r = rows[sym]
        clean = r["recent_matched"] == r["recent"]
        all_clean &= clean and r["trusted"]
        print(f"   {sym:<10} {r['compared']:>9} {r['matched']:>8} {r['recent']:>7} "
              f"{r['recent_matched']:>6}  {'YES' if r['trusted'] else 'no'}")
        if r["last_mismatch"]:
            print(f"      last mismatch: {r['last_mismatch']}")

    held = {s: len(builder.bars(s)) for s in rows}
    print(f"\n   bars currently held from ticks: {held}")
    print(f"   trust needs {MIN_SAMPLE}+ comparisons and NO mismatch in the recent window.")

    print()
    if all_clean:
        print("   EVERY SYMBOL MATCHES EXACTLY — the gate for serving tick-built candles is met.")
        print("   That is the go/no-go; turning serving on is a separate, deliberate step.")
    else:
        print("   NOT CLEAR YET. Either not enough comparisons, or a mismatch was seen.")
        print("   A mismatch is not a tuning problem — it means our candle is not the broker's")
        print("   candle, and the reason has to be understood before anything is served.")
    print()


if __name__ == "__main__":
    main()
