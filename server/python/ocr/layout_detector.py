"""
layout_detector.py
──────────────────
Adaptively detects the UI layout of a cTrader screenshot.

Instead of hard-coding pixel offsets, this module infers:
  - chart_region  : (x1, y1, x2, y2)  the candlestick chart area
  - info_panel    : (x1, y1, x2, y2)  the trade-info overlay band
  - title_bar     : (x1, y1, x2, y2)  instrument / timeframe strip
  - replay_bar    : (x1, y1, x2, y2)  bottom replay timestamp strip

All coordinates are in original-image pixels.
"""

from dataclasses import dataclass, field
from typing import Optional, Tuple
import numpy as np
import cv2

from image_preprocessor import PreprocessedImage


# ── Data ──────────────────────────────────────────────────────────────────────

@dataclass
class LayoutRegions:
    chart_region:  Optional[Tuple[int,int,int,int]] = None   # (x1,y1,x2,y2)
    info_panel:    Optional[Tuple[int,int,int,int]] = None
    title_bar:     Optional[Tuple[int,int,int,int]] = None
    replay_bar:    Optional[Tuple[int,int,int,int]] = None
    # Fractional references — useful when pixel coords aren't reliable
    chart_top_frac:    float = 0.08   # estimated fraction of image height
    chart_bottom_frac: float = 0.88
    chart_left_frac:   float = 0.0
    chart_right_frac:  float = 0.92
    confidence: str = "low"           # "low" | "medium" | "high"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _dominant_brightness_rows(gray: np.ndarray,
                               min_bright_cols: int = 40) -> np.ndarray:
    """Return boolean array: True for rows that contain significant bright content."""
    return (gray > 180).sum(axis=1) > min_bright_cols


def _find_horizontal_band(mask_1d: np.ndarray,
                           min_height: int = 4) -> list:
    """
    Given a 1-D boolean row mask, return list of (y_start, y_end) bands
    where mask is True for at least min_height consecutive rows.
    """
    bands = []
    in_band = False
    start   = 0
    for i, v in enumerate(mask_1d):
        if v and not in_band:
            in_band = True; start = i
        elif not v and in_band:
            in_band = False
            if i - start >= min_height:
                bands.append((start, i - 1))
    if in_band and len(mask_1d) - start >= min_height:
        bands.append((start, len(mask_1d) - 1))
    return bands


def _detect_info_panel_by_green_band(pimg: PreprocessedImage
                                      ) -> Optional[Tuple[int,int,int,int]]:
    """
    The JForex trade-info overlay is green/teal (Long) or red/maroon (Short).
    Detect either by looking for rows with many coloured pixels.
    """
    threshold = pimg.width * 0.10
    # Green / teal band (Long trade)
    green_mask = pimg.color_mask((40, 30, 40), (100, 255, 255))
    # Red / maroon band (Short trade): hue 0-15 or 165-180, sat>60
    red_mask1  = pimg.color_mask((0,   60, 40), (15,  255, 255))
    red_mask2  = pimg.color_mask((165,  60, 40), (180, 255, 255))
    import cv2 as _cv2
    combined   = _cv2.bitwise_or(green_mask, _cv2.bitwise_or(red_mask1, red_mask2))
    row_sums   = combined.sum(axis=1)
    green_rows = np.where(row_sums > threshold * 255)[0]
    if not len(green_rows):
        return None
    y1 = max(0, int(green_rows.min()) - 2)
    y2 = min(pimg.height, int(green_rows.max()) + 2)
    return (0, y1, pimg.width, y2)


def _detect_info_panel_by_white_density(pimg: PreprocessedImage
                                         ) -> Optional[Tuple[int,int,int,int]]:
    """
    Fallback: find a horizontal strip of densely-packed white text.
    Typically the info overlay contains more white pixels than the chart.
    """
    bright_rows = _dominant_brightness_rows(pimg.gray, min_bright_cols=pimg.width // 6)
    bands = _find_horizontal_band(bright_rows, min_height=8)
    if not bands:
        return None
    # Take the tallest band that isn't at the very top (title bar)
    chart_start_approx = int(pimg.height * 0.08)
    chart_end_approx   = int(pimg.height * 0.92)
    candidates = [(s, e) for s, e in bands
                  if s > chart_start_approx and e < chart_end_approx]
    if not candidates:
        return None
    s, e = max(candidates, key=lambda b: b[1] - b[0])
    return (0, s, pimg.width, e)


def _detect_title_bar(pimg: PreprocessedImage) -> Tuple[int,int,int,int]:
    """
    The title bar sits in the top ~8 % of the image.
    It contains the instrument name, timeframe, and session clock.
    We simply use a fixed fraction — it is highly consistent in cTrader.
    """
    y2 = int(pimg.height * 0.08)
    return (0, 0, pimg.width, y2)


def _detect_replay_bar(pimg: PreprocessedImage) -> Optional[Tuple[int,int,int,int]]:
    """
    The replay bar at the bottom contains dark text on a lighter background.
    Detect by looking for rows with many dark pixels in the bottom 20 %.
    """
    bottom_start = int(pimg.height * 0.80)
    bottom_gray  = pimg.gray[bottom_start:, :]
    # Dark text (< 80) on lighter background
    dark_rows    = (bottom_gray < 80).sum(axis=1)
    threshold    = pimg.width * 0.02  # at least 2 % dark cols
    has_dark     = dark_rows > threshold
    dark_row_idx = np.where(has_dark)[0]
    if not len(dark_row_idx):
        return None
    y1 = bottom_start + int(dark_row_idx.min()) - 2
    y2 = pimg.height
    return (0, max(0, y1), pimg.width, y2)


def _infer_chart_region(pimg: PreprocessedImage,
                        title_bar: Tuple,
                        info_panel: Optional[Tuple],
                        replay_bar: Optional[Tuple]) -> Tuple[int,int,int,int]:
    """
    Chart region = everything between title bar and replay bar,
    excluding the info-panel band on the y-axis.
    Horizontal: leave a small margin on the right for the price axis labels.
    """
    x1 = 0
    y1 = title_bar[3] if title_bar else int(pimg.height * 0.08)
    x2 = int(pimg.width * 0.92)   # right ~8 % = price scale labels
    y2 = replay_bar[1] if replay_bar else int(pimg.height * 0.88)

    # If info panel is inside the chart area, we'll keep the full y range
    # (the info panel overlaps the chart; we don't cut the chart for it).
    return (x1, y1, x2, y2)


# ── Public API ────────────────────────────────────────────────────────────────

def detect_layout(pimg: PreprocessedImage) -> LayoutRegions:
    """
    Main entry point.  Returns a LayoutRegions describing all major UI zones.
    Detection is adaptive — no hard-coded pixel offsets.
    """
    layout = LayoutRegions()

    # 1. Title bar (always at the top)
    layout.title_bar = _detect_title_bar(pimg)

    # 2. Info panel (green overlay or dense white text)
    layout.info_panel = _detect_info_panel_by_green_band(pimg)
    if layout.info_panel is None:
        layout.info_panel = _detect_info_panel_by_white_density(pimg)

    # 3. Replay timestamp bar (bottom)
    layout.replay_bar = _detect_replay_bar(pimg)

    # 4. Chart region derived from the above
    layout.chart_region = _infer_chart_region(
        pimg, layout.title_bar, layout.info_panel, layout.replay_bar)

    # Update fractional references
    h, w = pimg.height, pimg.width
    cx1, cy1, cx2, cy2 = layout.chart_region
    layout.chart_top_frac    = cy1 / h
    layout.chart_bottom_frac = cy2 / h
    layout.chart_left_frac   = cx1 / w
    layout.chart_right_frac  = cx2 / w

    # Confidence
    detected = sum([
        layout.info_panel  is not None,
        layout.replay_bar  is not None,
    ])
    layout.confidence = ["low", "medium", "high"][detected]

    return layout
