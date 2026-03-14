"""
drawdown_frequency.py
─────────────────────
Loss-frequency diagnostic broken down by trade attributes and instruments.

Responsibility:
  Produce two views of loss frequency that power the "Frequency" card in
  DrawdownPanel (the toggle between "Attr" and "Instr"):

  1. Attributes view  — groups trades by categorical tags:
       - Strategy      (e.g. "Trend Following", "Impulse Break")
       - Session time  (e.g. "London Open", "NY Session")
       - Psychology    (extracted from the tags list, e.g. "FOMO Trigger",
                        "Calm Execution")
       - Structure     (e.g. "HTF OB Failed", "CHOCH ID") derived from
                        ob_valid / choch_valid flags and tags

  2. Instruments view — groups trades purely by instrument symbol

Input:
  trades: list[dict]  — filtered trade records (see drawdown_core.py schema)

Output (returned as dict, stored under "frequency" key by drawdown_core.py):
  {
    "attr": [
      {
        "cat":    "Strategy",          # category label
        "name":   "S1: Trend Following",
        "total":  42,
        "losses": 12,
        "loss_rate": 28.6              # losses / total * 100
      },
      ...
    ],
    "instr": [
      {
        "cat":    "Instrument",
        "name":   "EURUSD",
        "total":  110,
        "losses": 35,
        "loss_rate": 31.8
      },
      ...
    ]
  }

Calculation notes:
  - Sort each list descending by loss_rate so the worst performers appear
    at the top; this makes the high-loss items immediately visible.
  - Psychology tags are stored as free-text in the trade "tags" list.
    Parse common patterns ("FOMO", "revenge", "calm", etc.) and group them.
  - Structural tags are derived from boolean flags (ob_valid, choch_valid,
    fvg_trap) combined with the outcome field.
  - Minimum group size threshold: only include groups with >= 5 trades to
    avoid misleading 100% loss rates from tiny samples.
"""


def compute_frequency(trades: list) -> dict:
    """
    Compute attribute-based and instrument-based loss frequency.
    Returns a dict with keys "attr" and "instr", each a list of group dicts.
    """
    pass
