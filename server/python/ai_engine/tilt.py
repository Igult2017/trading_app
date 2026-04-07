"""
ai_engine/tilt.py
Post-loss tilt detection.

Measures whether a trader's win rate drops significantly in the trades
immediately following N consecutive losses — a common sign of emotional
degradation (tilt).
"""
from __future__ import annotations

from ._models import TiltResult
from ._utils import is_win, is_loss, win_rate, is_sufficient


# ── Main detector ─────────────────────────────────────────────────────────────

def detect_tilt(
    trades:              list[dict],
    consecutive_losses:  int = 2,
    post_window:         int = 5,
) -> TiltResult:
    """
    After `consecutive_losses` losses in a row, look at the next
    `post_window` trades and measure their win rate.

    Returns a TiltResult indicating whether tilt is detectable.

    Parameters
    ----------
    trades             : full trade list (will be sorted by date internally)
    consecutive_losses : N — how many consecutive losses trigger the tilt window
    post_window        : K — how many trades after the trigger to measure
    """
    baseline = win_rate(trades)

    # Sort trades chronologically (best-effort — missing dates fall to end)
    def _sort_key(t: dict) -> str:
        return (
            t.get("openedAt") or t.get("tradeDate") or
            t.get("createdAt") or t.get("entryTime") or ""
        )

    sorted_trades = sorted(trades, key=_sort_key)
    n = len(sorted_trades)

    # Collect post-tilt trades (by index, so the same trade can appear once)
    post_tilt_indices: set[int] = set()

    for i in range(n - consecutive_losses):
        # Check for N consecutive losses starting at i
        if all(is_loss(sorted_trades[i + j]) for j in range(consecutive_losses)):
            # Mark the next K trades as post-tilt
            for k in range(1, post_window + 1):
                idx = i + consecutive_losses + k - 1
                if idx < n:
                    post_tilt_indices.add(idx)

    post_tilt_trades = [sorted_trades[i] for i in sorted(post_tilt_indices)]

    if not is_sufficient(len(post_tilt_trades)):
        return TiltResult(
            detected=False,
            post_loss_win_rate=None,
            baseline_win_rate=round(baseline, 4),
            deviation=None,
            sample_size=len(post_tilt_trades),
            consecutive_losses=consecutive_losses,
        )

    tilt_wr  = win_rate(post_tilt_trades)
    deviation = tilt_wr - baseline

    # Only flag as tilt if the win rate is meaningfully below baseline
    detected = deviation < -0.10  # more than 10 pp below baseline

    return TiltResult(
        detected=detected,
        post_loss_win_rate=round(tilt_wr, 4),
        baseline_win_rate=round(baseline, 4),
        deviation=round(deviation, 4),
        sample_size=len(post_tilt_trades),
        consecutive_losses=consecutive_losses,
    )


def tilt_finding_text(result: TiltResult) -> str | None:
    """
    Return a human-readable tilt finding string, or None if not detected.
    Used by core.py to add to the risk section.
    """
    if not result.detected or result.post_loss_win_rate is None:
        return None
    return (
        f"Post-loss tilt detected: after {result.consecutive_losses} consecutive losses, "
        f"win rate drops to {result.post_loss_win_rate:.0%} "
        f"(baseline {result.baseline_win_rate:.0%}, "
        f"{result.deviation:+.0%} deviation) "
        f"across {result.sample_size} measured trades."
    )
