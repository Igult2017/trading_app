"""
candle_detector.py
──────────────────
Detects individual candlestick objects in the chart region.

Each detected candle has:
  - x_center  : horizontal pixel position (used for time ordering)
  - body_top  : y of top of body (open or close, whichever higher)
  - body_bot  : y of bottom of body
  - wick_top  : y of highest wick tip  (lowest y value = highest price)
  - wick_bot  : y of lowest  wick tip  (highest y value = lowest  price)
  - direction : "bull" | "bear" | "doji"
  - column_x1/x2 : bounding x of the candle column

IMPORTANT: This module does NOT use global pixel extremes.
Each candle is a distinct object. Outcome logic iterates candles
in time order (left → right = older → newer).
"""

from dataclasses import dataclass
from typing import List, Optional, Tuple
import numpy as np
import cv2

from image_preprocessor import PreprocessedImage
from layout_detector import LayoutRegions


# ── Data ──────────────────────────────────────────────────────────────────────

@dataclass
class Candle:
    x_center:  int          # pixel x centre of the candle column
    column_x1: int
    column_x2: int
    wick_top:  int          # y-coord of highest wick (smaller y = higher price)
    body_top:  int
    body_bot:  int
    wick_bot:  int          # y-coord of lowest  wick (larger  y = lower  price)
    direction: str          # "bull" | "bear" | "doji"

    @property
    def high_y(self) -> int:
        """Smallest y = highest price."""
        return self.wick_top

    @property
    def low_y(self) -> int:
        """Largest y = lowest price."""
        return self.wick_bot


# ── Colour masks ──────────────────────────────────────────────────────────────

def _candle_mask(pimg: PreprocessedImage,
                 chart_x1: int, chart_y1: int,
                 chart_x2: int, chart_y2: int) -> np.ndarray:
    """
    Build a binary mask covering all candle pixels (bodies + wicks)
    within the chart region.

    Combines:
      - Bullish (green/teal) candle body colours
      - Bearish (red/orange-red) candle body colours
      - Neutral wick grey (thin wicks on cTrader dark theme)

    The mask is returned in full-image coordinates.
    """
    h, w = pimg.height, pimg.width

    # --- Green/bull candles ---
    bull = pimg.color_mask((38,  35,  50), (100, 255, 255))

    # --- Red/bear candles (hue wraps around 180) ---
    bear1 = pimg.color_mask((0,   35,  50), (12, 255, 255))
    bear2 = pimg.color_mask((163, 35,  50), (180, 255, 255))
    bear  = cv2.bitwise_or(bear1, bear2)

    # --- Grey wicks (low saturation, medium-high value) ---
    wick = pimg.color_mask((0, 0, 120), (180, 40, 220))

    combined = cv2.bitwise_or(bull, cv2.bitwise_or(bear, wick))

    # Zero out everything outside the chart region
    mask = np.zeros((h, w), dtype=np.uint8)
    mask[chart_y1:chart_y2, chart_x1:chart_x2] = \
        combined[chart_y1:chart_y2, chart_x1:chart_x2]

    # Morphological cleanup: close small gaps within candles
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 3))
    mask   = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    return mask


# ── Column segmentation ───────────────────────────────────────────────────────

def _segment_candle_columns(mask: np.ndarray,
                             chart_x1: int, chart_x2: int,
                             chart_y1: int, chart_y2: int,
                             min_col_width: int = 2,
                             max_col_width: int = 80,
                             min_col_height: int = 5) -> List[Tuple[int,int]]:
    """
    Find x-ranges (column_x1, column_x2) that correspond to individual candles.

    Strategy:
      1. Project mask onto x-axis → column occupancy profile
      2. Find contiguous runs of non-zero columns
      3. Filter by width plausibility
    """
    col_profile = mask[chart_y1:chart_y2, chart_x1:chart_x2].sum(axis=0)
    occupied    = (col_profile > 0).astype(np.int8)

    columns = []
    in_col  = False
    start   = 0
    for i, v in enumerate(occupied):
        if v and not in_col:
            in_col = True; start = i
        elif not v and in_col:
            in_col = False
            w = i - start
            if min_col_width <= w <= max_col_width:
                columns.append((chart_x1 + start, chart_x1 + i - 1))
    if in_col:
        w = len(occupied) - start
        if min_col_width <= w <= max_col_width:
            columns.append((chart_x1 + start, chart_x1 + len(occupied) - 1))

    # Merge very close columns (gap ≤ 2 px) — handles thin wicks between bodies
    merged = []
    for col in columns:
        if merged and col[0] - merged[-1][1] <= 3:
            merged[-1] = (merged[-1][0], col[1])
        else:
            merged.append(list(col))
    merged = [tuple(c) for c in merged]

    return merged


# ── Per-column candle extraction ──────────────────────────────────────────────

def _extract_candle_from_column(pimg: PreprocessedImage,
                                 mask: np.ndarray,
                                 x1: int, x2: int,
                                 chart_y1: int, chart_y2: int
                                 ) -> Optional[Candle]:
    """
    Given a column x-range, extract the full OHLC pixel structure.

    Body detection:
      - Green body  → high saturation green pixels
      - Red body    → high saturation red pixels
    Wick detection:
      - Any candle-coloured pixel in the column outside the body
    """
    col_mask   = mask[chart_y1:chart_y2, x1:x2+1]
    rows_hit   = np.where(col_mask.sum(axis=1) > 0)[0]
    if not len(rows_hit):
        return None
    abs_rows   = rows_hit + chart_y1

    wick_top = int(abs_rows.min())
    wick_bot = int(abs_rows.max())

    if wick_bot - wick_top < 2:          # too thin — probably noise
        return None

    # ── Identify body vs wick ─────────────────────────────────────────
    # Body pixels are high-saturation; wicks are grey (low saturation).
    col_hsv = pimg.hsv[chart_y1:chart_y2, x1:x2+1, :]
    sat     = col_hsv[:, :, 1]           # saturation channel
    in_mask = col_mask > 0

    body_rows = np.where((in_mask.sum(axis=1) > 0) & (sat.max(axis=1) > 50))[0]

    if len(body_rows):
        body_top = int(body_rows.min())  + chart_y1
        body_bot = int(body_rows.max())  + chart_y1
    else:
        # Doji — body and wick coincide
        body_top = wick_top
        body_bot = wick_bot

    # ── Direction ─────────────────────────────────────────────────────
    col_bgr  = pimg.bgr[body_top:body_bot+1, x1:x2+1]
    if col_bgr.size == 0:
        direction = "doji"
    else:
        body_hsv = cv2.cvtColor(col_bgr, cv2.COLOR_BGR2HSV)
        h_ch     = body_hsv[:, :, 0].flatten()
        s_ch     = body_hsv[:, :, 1].flatten()
        v_ch     = body_hsv[:, :, 2].flatten()
        colored  = (s_ch > 50) & (v_ch > 50)
        if not colored.any():
            direction = "doji"
        else:
            hues      = h_ch[colored]
            green_px  = ((hues >= 38) & (hues <= 100)).sum()
            red_px    = ((hues <= 12) | (hues >= 163)).sum()
            if green_px > red_px * 1.2:
                direction = "bull"
            elif red_px > green_px * 1.2:
                direction = "bear"
            else:
                direction = "doji"

    x_center = (x1 + x2) // 2
    return Candle(
        x_center  = x_center,
        column_x1 = x1,
        column_x2 = x2,
        wick_top  = wick_top,
        body_top  = body_top,
        body_bot  = body_bot,
        wick_bot  = wick_bot,
        direction = direction,
    )


# ── Public API ────────────────────────────────────────────────────────────────

def detect_candles(pimg: PreprocessedImage,
                   layout: LayoutRegions) -> List[Candle]:
    """
    Detect all candles in the chart region, returned sorted left → right
    (oldest → newest in time).

    Parameters
    ----------
    pimg   : PreprocessedImage
    layout : LayoutRegions  (from layout_detector.detect_layout)

    Returns
    -------
    List[Candle] sorted by x_center ascending.
    """
    if layout.chart_region is None:
        return []

    cx1, cy1, cx2, cy2 = layout.chart_region

    mask    = _candle_mask(pimg, cx1, cy1, cx2, cy2)
    columns = _segment_candle_columns(mask, cx1, cx2, cy1, cy2)

    candles = []
    for (col_x1, col_x2) in columns:
        c = _extract_candle_from_column(pimg, mask, col_x1, col_x2, cy1, cy2)
        if c is not None:
            candles.append(c)

    # Sort by x_center (chronological order, left = older)
    candles.sort(key=lambda c: c.x_center)
    return candles


def find_entry_candle_index(candles: List[Candle],
                             entry_x: int,
                             tolerance_px: int = 20) -> Optional[int]:
    """
    Given the x-position of the entry arrow, return the index into
    the candles list of the entry candle (the one the arrow points to).

    Returns None if no candle is found within tolerance.
    """
    if entry_x is None or not candles:
        return None
    best_idx  = None
    best_dist = float("inf")
    for i, c in enumerate(candles):
        dist = abs(c.x_center - entry_x)
        if dist < best_dist:
            best_dist = dist
            best_idx  = i
    if best_dist <= tolerance_px:
        return best_idx
    return None
