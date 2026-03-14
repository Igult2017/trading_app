"""
drawdown/frequency.py
────────────────────────────────────────────────────────────────────────────
Loss-frequency breakdown by trade attributes and by instrument.

Responsibility:
  Power the "Frequency" toggle card in DrawdownPanel by producing two views:

  1. Attributes view  — loss frequency grouped by categorical tags:
       Strategy    (e.g. "Trend Following", "Impulse Break")
       Session     (e.g. "London Open", "NY Session")
       Psychology  (extracted from tags list: "FOMO Trigger", "Calm Execution")
       Structure   (derived from ob_valid/choch_valid flags + tags)

  2. Instruments view — loss frequency grouped by instrument symbol only

Input:
  trades: list[dict]  — trade records (see core.py for field schema)

Output (returned as dict, stored under "frequency" by core.py):
  {
    "attr": [
      {
        "cat":      "Strategy",
        "name":     "S1: Trend Following",
        "total":    42,
        "losses":   12,
        "lossRate": 28.6          # losses / total * 100
      },
      ...
    ],
    "instr": [
      {
        "cat":      "Instrument",
        "name":     "EURUSD",
        "total":    110,
        "losses":   35,
        "lossRate": 31.8
      },
      ...
    ]
  }

Calculation notes:
  - Sort each list descending by lossRate so worst performers appear first.
  - Psychology tags: parse the free-text "tags" array for keywords:
      "fomo" → "FOMO Trigger"
      "revenge" → "Revenge Trade"
      "calm" / "disciplined" → "Calm Execution"
      "oversize" → "Oversized Position"
  - Structural tags are derived from boolean fields:
      ob_valid=False + outcome="loss"  → "HTF OB Failed"
      choch_valid=False + outcome="loss" → "CHOCH Failure"
      fvg_trap=True → "FVG Trap"
      htfBias="counter_trend" → "Counter-Trend Entry"
  - Minimum group size: only include groups with >= 5 trades to avoid
    misleading 100% loss rates from tiny samples.

TODO — implement compute_frequency(trades):
  - Build attr groups: strategy, session, psychology tags, structural
  - Build instr groups: by symbol
  - Compute total/losses/lossRate for each group
  - Filter out groups with < 5 trades
  - Sort both lists by lossRate descending
  - Return the dict with "attr" and "instr" keys
"""


def compute_frequency(trades: list) -> dict:
    """
    Compute attribute-based and instrument-based loss frequency.
    Returns a dict with keys "attr" and "instr", each a list of group dicts.
    """
    # TODO: implement
    return {"attr": [], "instr": []}
