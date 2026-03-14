"""
drawdown_structural.py
──────────────────────
Structural diagnostics: breakdown of losses by SMC context and entry quality.

Responsibility:
  Produce the two diagnostic views that power the "Structural Diagnostics"
  card (Context tab and Entry tab) in DrawdownPanel.

  Context tab — why the trade context was wrong:
    - CTF Validity:   HTF Orderblock Failed / HTF Swing Alignment
    - ATF Validity:   Fake-out CHoCH identification / Unmitigated FVG Trap
    - HTF Bias:       Counter-Trend Entry vs With-Trend Entry

  Entry tab — why the execution was poor:
    - ETF Execution:  Premature BOS Execution / Inducement Failure
    - Entry Timing:   Early Entry (pre-confirmation) vs Confirmed Entry
    - Risk Placement: SL Above/Below Wick vs SL Inside Structure

Input:
  trades: list[dict]  — filtered trade records (see drawdown_core.py schema)

Output (returned as dict, stored under "structural" key by drawdown_core.py):
  {
    "context": [
      {
        "title": "CTF Validity",
        "items": [
          {
            "label":        "HTF Orderblock Failed",
            "avg_dd_pct":   -3.2,    # mean pnl_pct of losing trades in group
            "total":        12,
            "losses":       9,
            "loss_rate":    75.0,    # losses / total * 100
            "bar_width_pct": 75.0   # same as loss_rate, used for progress bar
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

Calculation notes:
  - HTF Orderblock Failed:   trades where ob_valid == False and outcome == "loss"
  - HTF Swing Alignment:     trades where htf_bias == "with_trend" (correct)
                              vs any misaligned case
  - Fake-out CHoCH:          trades where choch_valid == False and outcome == "loss"
  - Unmitigated FVG Trap:    trades tagged "fvg_trap" == True
  - Counter-Trend Entry:     trades where htf_bias == "counter_trend"
  - Premature BOS:           trades where entry_type == "premature"
  - Confirmed Entry:         trades where entry_type == "confirmed"
  - SL placement:            trades grouped by sl_placement field value
  - avg_dd_pct is computed only from the losing trades in each sub-group.
  - bar_width_pct is clamped between 0 and 100.
"""


def compute_structural(trades: list) -> dict:
    """
    Compute context and entry structural diagnostics.
    Returns a dict with keys "context" and "entry", each a list of sections.
    """
    pass
