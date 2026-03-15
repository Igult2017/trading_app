"""
object_detector.py  (v8 — JForex calibrated)
──────────────────────────────────────────────
Detects:
  - Entry arrow  (JForex orange: HSV hue 14-26, sat>120, val>120)
  - TP / SL level lines (horizontal dashed lines)

JForex arrow pixel analysis results:
  img1 EURUSD  : centroid (543,195), area≈14px²
  img4 USDCHF  : centroid (688,137), area≈15px²
  img6 GBPUSD  : centroid (481,193), area≈12px²
  → Minimum area threshold: 8px² (not 20 as before)
  → HSV range: (14,120,120)-(26,255,255)
"""

from dataclasses import dataclass, field
from typing import List, Optional, Tuple
import numpy as np
import cv2

from image_preprocessor import PreprocessedImage
from layout_detector import LayoutRegions


# ── Data ──────────────────────────────────────────────────────────────────────

@dataclass
class EntryArrow:
    x:   int
    y:   int
    confidence: float = 1.0


@dataclass
class LevelLine:
    y:     int
    score: float = 0.0
    label: str   = ""


@dataclass
class DetectedObjects:
    entry_arrow: Optional[EntryArrow]  = None
    level_lines: List[LevelLine]       = field(default_factory=list)
    tp_line:     Optional[LevelLine]   = None
    sl_line:     Optional[LevelLine]   = None


# ── Entry arrow ───────────────────────────────────────────────────────────────

# JForex orange: hue 14-26, saturation >120, value >120
_ARROW_RANGES = [
    ((14, 120, 120), (26, 255, 255)),   # primary JForex orange
    ((10, 100, 130), (30, 255, 255)),   # wider fallback
]


def _detect_entry_arrow(pimg: PreprocessedImage,
                         chart_region: Tuple) -> Optional[EntryArrow]:
    h    = pimg.height
    cx1, cy1, cx2, cy2 = chart_region
    safe_y2 = min(cy2, int(h * 0.80))   # exclude bottom 20% (replay triangle)

    combined = np.zeros((pimg.height, pimg.width), dtype=np.uint8)
    for lo, hi in _ARROW_RANGES:
        combined = cv2.bitwise_or(combined, pimg.color_mask(lo, hi))

    # Restrict to chart area
    mask = np.zeros_like(combined)
    mask[cy1:safe_y2, cx1:cx2] = combined[cy1:safe_y2, cx1:cx2]

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL,
                                    cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    best = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(best)
    if area < 8:    # JForex arrows are small — lowered from 20
        return None

    M = cv2.moments(best)
    if M["m00"] == 0:
        return None

    cx = int(M["m10"] / M["m00"])
    cy = int(M["m01"] / M["m00"])
    confidence = min(1.0, area / 200.0)
    return EntryArrow(x=cx, y=cy, confidence=confidence)


# ── Level lines ───────────────────────────────────────────────────────────────

def _transition_score(row: np.ndarray,
                       thresh: int = 140) -> Tuple[int, int]:
    bright      = (row > thresh).astype(np.int8)
    transitions = int(np.sum(np.abs(np.diff(bright))))
    bright_count = int(np.sum(bright))
    return transitions, bright_count


def _detect_level_lines(pimg: PreprocessedImage,
                         chart_region: Tuple) -> List[LevelLine]:
    cx1, cy1, cx2, cy2 = chart_region
    scan_w = max(1, cx2 - cx1)

    dyn_min_t = max(12, int(scan_w * 0.04))
    dyn_min_b = max(15, int(scan_w * 0.02))

    level_rows: List[Tuple[int, float]] = []
    for y in range(cy1, cy2):
        row_max = np.maximum(
            pimg.bgr[y, cx1:cx2, 0],
            np.maximum(pimg.bgr[y, cx1:cx2, 1],
                       pimg.bgr[y, cx1:cx2, 2])
        ).astype(np.uint8)
        t, bc = _transition_score(row_max, thresh=140)
        if bc == 0:
            continue
        ratio = t / bc
        if t >= dyn_min_t and bc >= dyn_min_b and ratio >= 0.20:
            level_rows.append((y, float(t * ratio)))

    if not level_rows:
        return []

    # Cluster
    clusters: List[List[Tuple[int, float]]] = []
    cur: List[Tuple[int, float]] = [level_rows[0]]
    for item in level_rows[1:]:
        if item[0] - cur[-1][0] <= 5:
            cur.append(item)
        else:
            clusters.append(cur); cur = [item]
    clusters.append(cur)

    lines = []
    for cl in clusters:
        ys     = [r[0] for r in cl]
        scores = [r[1] for r in cl]
        y_mean = int(np.average(ys, weights=scores))
        lines.append(LevelLine(y=y_mean, score=float(np.max(scores))))

    lines.sort(key=lambda l: l.score, reverse=True)
    return lines


# ── TP / SL assignment ────────────────────────────────────────────────────────

def _assign_tp_sl(level_lines: List[LevelLine],
                  entry_arrow: Optional[EntryArrow],
                  direction: Optional[str]
                  ) -> Tuple[Optional[LevelLine], Optional[LevelLine]]:
    if not entry_arrow or not level_lines:
        return None, None

    entry_y    = entry_arrow.y
    non_entry  = [l for l in level_lines if abs(l.y - entry_y) > 20]
    if not non_entry:
        return None, None

    long  = (direction or "Long").lower() == "long"
    above = sorted([l for l in non_entry if l.y < entry_y],
                   key=lambda l: l.y, reverse=True)
    below = sorted([l for l in non_entry if l.y > entry_y],
                   key=lambda l: l.y)

    if long:
        tp_line = above[0] if above else None
        sl_line = below[0] if below else None
    else:
        tp_line = below[0] if below else None
        sl_line = above[0] if above else None

    if tp_line: tp_line.label = "TP"
    if sl_line: sl_line.label = "SL"
    return tp_line, sl_line


# ── Public API ────────────────────────────────────────────────────────────────

def detect_objects(pimg: PreprocessedImage,
                   layout: LayoutRegions,
                   direction: Optional[str] = None) -> DetectedObjects:
    result = DetectedObjects()
    if layout.chart_region is None:
        return result

    result.entry_arrow = _detect_entry_arrow(pimg, layout.chart_region)
    result.level_lines = _detect_level_lines(pimg, layout.chart_region)
    result.tp_line, result.sl_line = _assign_tp_sl(
        result.level_lines, result.entry_arrow, direction)
    return result
