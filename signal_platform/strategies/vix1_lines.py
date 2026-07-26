"""
VIX.1 — THE line, drawn off the FIRST momentum candle of the 1HR run.

There is ONE line: the momentum candle's BODY CLOSE. That price is also the next candle's open, so
it is the level the whole setup pivots on. Its job is to make the 1M accurate — it says where an
entry belongs and where it does not, and it is what the 1M is read against.

THERE IS NO LINE 2. A second "wick line" (line 1 offset by the momentum candle's open wick) existed
here until 2026-07-26 and was DELETED. It was never the user's — he uses one line and said so
plainly ("I dont know where the second line is coming from i dont use second line"; "that line 2 is
BS. It has no work"). The docs justified it with a quote attributed to him that he has disowned.

What it actually did, measured over 1,518 real momentum candles before removal:
  * it decided ALIGNMENT (which side of the market the 1M was on) instead of line 1;
  * it ANCHORED THE STOP — and this is the damage. Line 2 sat a median 2.0 pips from line 1, so the
    stop was the open wick plus a pip: a ~3 pip median risk on a pair whose spread is 1-2 pips.
  * it killed a pullback that retraced beyond it.

The removal is not a preference, it is a correctness fix. On a bear momentum candle the open wick IS
the counter-wick — the very quantity the momentum filter forces to be tiny (<=25% of range, <=15%
for an A grade). So line 2 was derived from a number the strategy independently drove toward zero,
and the stop shrank as the SETUP GOT BETTER: A-grade candles got a 2.2 pip stop, weaker ones 6.5.
That is backwards, and it is why the reconstruction ran 3-9 pip stops against the user's 15 and why
nothing survived a 1-pip spread. Do not reintroduce it in any form.

The stop now comes from where he actually puts it — the nearest 1M REGION OF INTEREST beyond the
pullback (vix1_roi), which is his own rule in his own words and had been sitting orphaned (imported
but never called) since the line-2 anchor replaced it.
"""
from core.types import Candle


def draw_line(vc: Candle) -> float:
    """THE line: the body close of the first momentum candle of the run.

    `vc` must be a CLOSED candle — a level read from the still-forming bar drifts until it closes
    (the platform-wide levels-closed/triggers-live rule). The caller guarantees this: vix1.analyze
    passes H1 through `closed_only`, and the backtests slice the same way.
    """
    return vc.close
