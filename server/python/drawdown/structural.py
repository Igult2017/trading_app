"""
drawdown/structural.py
────────────────────────────────────────────────────────────────────────────
Structural diagnostics: losses broken down by SMC context and entry quality.

Responsibility:
  Power the "Structural Diagnostics" card in DrawdownPanel, which has two tabs:

  Context tab — diagnoses WHY the trade context was wrong:
    CTF Validity:  HTF Orderblock Failed / HTF Swing Alignment
    ATF Validity:  Fake-out CHoCH / Unmitigated FVG Trap
    HTF Bias:      Counter-Trend Entry vs With-Trend Entry

  Entry tab — diagnoses WHY the execution was poor:
    ETF Execution: Premature BOS / Inducement Failure
    Entry Timing:  Early Entry (pre-confirmation) vs Confirmed Entry
    Risk Placement: SL Above/Below Wick vs SL Inside Structure

Input:
  trades: list[dict]  — trade records (see core.py for field schema)

Output (returned as dict, stored under "structural" by core.py):
  {
    "context": [
      {
        "title": "CTF Validity",
        "items": [
          {
            "label":       "HTF Orderblock Failed",
            "avgDdPct":    -3.2,    # mean pnlPct of losing trades in this group
            "total":       12,
            "losses":      9,
            "lossRate":    75.0,
            "barWidthPct": 75.0     # same as lossRate, used by frontend progress bar
          },
          ...
        ]
      },
      ...
    ],
    "entry": [
      {
        "title": "ETF Execution",
        "items": [ ... ]
      },
      ...
    ]
  }

Field derivation rules:
  HTF Orderblock Failed:  ob_valid == False AND outcome == "loss"
  HTF Swing Alignment:    htfBias == "with_trend"
  Fake-out CHoCH:         choch_valid == False AND outcome == "loss"
  FVG Trap:               fvg_trap == True
  Counter-Trend Entry:    htfBias == "counter_trend"
  Premature BOS:          entry_type == "premature"
  Confirmed Entry:        entry_type == "confirmed"
  SL Placement groups:    group by sl_placement field value

Calculation notes:
  - avgDdPct is computed from losing trades only (pnlPct values, negative).
  - barWidthPct = lossRate, clamped to 0–100.
  - Include every diagnostic group even if it has 0 trades — use zeroes so
    the frontend always renders all expected rows.

TODO — implement compute_structural(trades):
  - Build context section groups using field derivation rules above
  - Build entry section groups using field derivation rules above
  - Compute total/losses/lossRate/avgDdPct per item
  - Return dict with "context" and "entry" keys
"""


def compute_structural(trades: list) -> dict:
    """
    Compute SMC context and execution entry structural diagnostics.
    Returns a dict with keys "context" and "entry".
    """
    # TODO: implement
    return {"context": [], "entry": []}
