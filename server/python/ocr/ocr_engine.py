"""
ocr_engine.py  (v8 — JForex calibrated)
────────────────────────────────────────
Zone-aware OCR for JForex / cTrader dark-theme screenshots.

Pixel analysis findings (confirmed on 6 real screenshots):
  TP/SL labels : grey text (brightness 60-180) on dark bg (~40)
                 → scan rows in left 68%; OCR with thr=110, invert
  Info panel   : white text (val>185, sat<110) on green band (hue 60-100)
                 → isolate white pixels, binary mask, invert for OCR
  Replay bar   : dark text on dark-grey bg → scan for ISO date pattern
  Title bar    : white text on very dark bg → invert, thr=90
"""

from dataclasses import dataclass, field
from typing import List
import re
import numpy as np
import cv2
import pytesseract

from image_preprocessor import PreprocessedImage
from layout_detector import LayoutRegions


@dataclass
class OcrResult:
    title_lines:  List[str] = field(default_factory=list)
    label_lines:  List[str] = field(default_factory=list)
    replay_lines: List[str] = field(default_factory=list)
    psm11_tokens: List[dict] = field(default_factory=list)

    @property
    def all_lines(self) -> List[str]:
        return self.title_lines + self.label_lines + self.replay_lines


def _ocr(bgr: np.ndarray, scale: int = 4, psm: int = 7,
         invert: bool = True, threshold: int = 110) -> str:
    if bgr is None or bgr.size == 0:
        return ""
    sh, sw = bgr.shape[:2]
    if sh < 3 or sw < 3:
        return ""
    sc   = cv2.resize(bgr, (sw * scale, sh * scale),
                       interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(sc, cv2.COLOR_BGR2GRAY)
    if threshold == 0:
        _, thr = cv2.threshold(gray, 0, 255,
                                cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    else:
        _, thr = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY)
    if invert:
        thr = cv2.bitwise_not(thr)
    return pytesseract.image_to_string(
        thr, config=f"--psm {psm} --oem 3").strip()


def _ocr_title_bar(pimg: PreprocessedImage, layout: LayoutRegions) -> List[str]:
    if layout.title_bar is None:
        return []
    _, y1, _, y2 = layout.title_bar
    text = _ocr(pimg.bgr[y1:y2, :], scale=4, psm=6, invert=True, threshold=90)
    return [l.strip() for l in text.splitlines() if l.strip()]


def _find_label_rows(pimg: PreprocessedImage, layout: LayoutRegions) -> List[str]:
    """
    TP/SL/info-panel label rows: grey text on dark bg.
    Detection: rows with >=12 mid-brightness pixels in left 68%,
               <25 very-bright, <85% pure-black.
    """
    h, w = pimg.height, pimg.width
    x_end    = int(w * 0.68)
    gray     = pimg.gray
    chart_y1 = layout.chart_region[1] if layout.chart_region else int(h * 0.08)
    # Extend scan 60px below chart_y2 — SL label often sits just below chart edge
    chart_y2_raw = layout.chart_region[3] if layout.chart_region else int(h * 0.90)
    chart_y2 = min(h - 20, chart_y2_raw + 60)

    label_ys: List[int] = []
    for y in range(chart_y1, chart_y2):
        row         = gray[y, :x_end]
        mid         = int(((row >= 60) & (row <= 180)).sum())
        very_bright = int((row > 220).sum())
        very_dark   = int((row < 20).sum())
        if mid >= 12 and very_bright < 25 and very_dark < x_end * 0.85:
            label_ys.append(y)

    if not label_ys:
        return []

    clusters: List[List[int]] = []
    cur: List[int] = [label_ys[0]]
    for y in label_ys[1:]:
        if y - cur[-1] <= 5:
            cur.append(y)
        else:
            clusters.append(cur); cur = [y]
    clusters.append(cur)

    results: List[str] = []
    for cl in clusters:
        if cl[-1] - cl[0] < 2:
            continue
        y1c, y2c = cl[0], cl[-1]
        strip = pimg.bgr[max(0, y1c - 2): min(h, y2c + 4), :int(w * 0.72)]
        text  = _ocr(strip, scale=4, psm=6, invert=True, threshold=110)
        for line in text.splitlines():
            line = line.strip()
            if line and re.search(r'[0-9a-zA-Z]', line) and len(line) > 3:
                results.append(line)
    return results


def _ocr_info_panel(pimg: PreprocessedImage, layout: LayoutRegions) -> List[str]:
    """White text on green band."""
    h, w = pimg.height, pimg.width
    hsv  = pimg.hsv

    # Match both green (Long) and red/maroon (Short) info bands
    green_mask = cv2.inRange(hsv, (40,  30,  40), (100, 255, 255))
    red_mask1  = cv2.inRange(hsv, (0,   60,  40), (15,  255, 255))
    red_mask2  = cv2.inRange(hsv, (165,  60,  40), (180, 255, 255))
    band_mask  = cv2.bitwise_or(green_mask, cv2.bitwise_or(red_mask1, red_mask2))
    green_col_count = band_mask.sum(axis=1)
    green_rows = np.where(green_col_count > w * 0.10 * 255)[0]

    if not len(green_rows):
        if layout.info_panel:
            _, y1, _, y2 = layout.info_panel
        else:
            y1, y2 = int(h * 0.40), int(h * 0.82)
    else:
        y1 = max(0, int(green_rows.min()) - 2)
        y2 = min(h, int(green_rows.max()) + 3)

    band_hsv   = hsv[y1:y2, :]
    white_mask = (((band_hsv[:,:,2] > 185) & (band_hsv[:,:,1] < 110))
                  .astype(np.uint8) * 255)

    if int(white_mask.sum()) < 500:
        _, white_mask = cv2.threshold(pimg.gray[y1:y2, :],
                                       175, 255, cv2.THRESH_BINARY)

    sh, sw = white_mask.shape[:2]
    if sh < 2 or sw < 2:
        return []

    scale = max(3, min(5, 200 // max(sh, 1)))
    inv   = cv2.bitwise_not(
                cv2.resize(white_mask, (sw * scale, sh * scale),
                            interpolation=cv2.INTER_NEAREST))
    text  = pytesseract.image_to_string(inv, config="--psm 6 --oem 3").strip()
    return [l.strip() for l in text.splitlines()
            if l.strip() and re.search(r'[0-9a-zA-Z]', l)]


def _ocr_replay_bar(pimg: PreprocessedImage, layout: LayoutRegions) -> List[str]:
    h, w = pimg.height, pimg.width
    y1   = layout.replay_bar[1] if layout.replay_bar else int(h * 0.82)
    strip = pimg.bgr[y1:h, :int(w * 0.78)]
    if strip.size == 0:
        return []
    lines: List[str] = []
    for inv, thr in [(True, 90), (False, 80)]:
        for line in _ocr(strip, scale=3, psm=6, invert=inv,
                          threshold=thr).splitlines():
            line = line.strip()
            if re.search(r'\d{4}-\d{2}-\d{2}', line):
                lines.append(line)
    return lines


def _psm11_scan(pimg: PreprocessedImage) -> List[dict]:
    h, w  = pimg.height, pimg.width
    sc    = cv2.resize(pimg.gray, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
    clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
    enh   = clahe.apply(sc)
    _, thr = cv2.threshold(enh, 90, 255, cv2.THRESH_BINARY_INV)
    data   = pytesseract.image_to_data(thr, config="--psm 11 --oem 3",
                                        output_type=pytesseract.Output.DICT)
    return [{"text": t.strip(), "x": data['left'][i]//2, "y": data['top'][i]//2}
            for i, t in enumerate(data['text'])
            if t.strip() and data['conf'][i] >= 30]


def run_all_ocr(pimg: PreprocessedImage, layout: LayoutRegions) -> OcrResult:
    import sys
    result = OcrResult()
    try:
        result.title_lines  = _ocr_title_bar(pimg, layout)
    except Exception as e:
        print(f"[OCR WARNING] title_bar OCR failed: {e}", file=sys.stderr)
    try:
        result.label_lines  = _find_label_rows(pimg, layout)
        result.label_lines += _ocr_info_panel(pimg, layout)
    except Exception as e:
        print(f"[OCR WARNING] label/info_panel OCR failed: {e}", file=sys.stderr)
    try:
        result.replay_lines = _ocr_replay_bar(pimg, layout)
    except Exception as e:
        print(f"[OCR WARNING] replay_bar OCR failed: {e}", file=sys.stderr)
    try:
        result.psm11_tokens = _psm11_scan(pimg)
    except Exception as e:
        print(f"[OCR WARNING] psm11 scan failed: {e}", file=sys.stderr)
    return result
