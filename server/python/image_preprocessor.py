"""
image_preprocessor.py
─────────────────────
Loads images and applies adaptive preprocessing before any analysis.
No hard-coded layout assumptions — all geometry is derived from the image.
"""

import base64
import numpy as np
import cv2


def load_from_b64(b64_str: str) -> np.ndarray:
    if "," in b64_str:
        b64_str = b64_str.split(",", 1)[1]
    b64_str = b64_str.strip()
    b64_str += "=" * ((4 - len(b64_str) % 4) % 4)
    data = base64.b64decode(b64_str)
    arr  = np.frombuffer(data, np.uint8)
    img  = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image — invalid base64 or unsupported format.")
    return img


def load_from_path(path: str) -> np.ndarray:
    img = cv2.imread(path)
    if img is None:
        raise ValueError(f"Could not load image from path: {path}")
    return img


class PreprocessedImage:
    """
    Holds the original image plus derived preprocessing artefacts:
      - bgr       : original colour image
      - gray      : single-channel greyscale
      - hsv       : HSV colour space (for colour-range detection)
      - clahe     : contrast-enhanced greyscale (clipLimit=4, tileGrid=8×8)
      - height/width: convenience dimensions

    Production pipeline per region:
      load → denoise → CLAHE → adaptive/fixed threshold → OCR
    """

    # Target character height for Tesseract (px). OCR is most accurate at 30-40px.
    _TARGET_CHAR_PX = 36

    def __init__(self, img: np.ndarray):
        self.bgr    = img
        self.height, self.width = img.shape[:2]
        self.gray   = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        self.hsv    = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

        # CLAHE — improve contrast for low-brightness text regions
        _clahe     = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
        self.clahe = _clahe.apply(self.gray)

    # ── convenience helpers ────────────────────────────────────────────────

    def crop(self, x1: int, y1: int, x2: int, y2: int) -> "PreprocessedImage":
        """Return a new PreprocessedImage cropped to the given pixel box."""
        x1 = max(0, x1); y1 = max(0, y1)
        x2 = min(self.width, x2); y2 = min(self.height, y2)
        return PreprocessedImage(self.bgr[y1:y2, x1:x2].copy())

    def color_mask(self,
                   lower: tuple, upper: tuple,
                   space: str = "hsv") -> np.ndarray:
        """
        Return a binary mask for pixels within [lower, upper] in the
        requested colour space ("hsv" or "bgr").

        For red hues (which wrap at 0/180 in OpenCV HSV), call twice and OR:
            m = color_mask((0,s,v),(10,255,255)) | color_mask((170,s,v),(180,255,255))
        cv2.inRange does NOT wrap hue automatically — the caller is responsible.
        """
        if space not in ("hsv", "bgr"):
            raise ValueError(f"color_mask: space must be 'hsv' or 'bgr', got {space!r}")
        src = self.hsv if space == "hsv" else self.bgr
        lo  = np.array(lower, dtype=np.uint8)
        hi  = np.array(upper, dtype=np.uint8)
        return cv2.inRange(src, lo, hi)

    def scale_up(self, factor: int = None, region: np.ndarray = None) -> np.ndarray:
        """
        Return an upscaled BGR copy for OCR.
        If factor is None, computes adaptively so characters reach ~TARGET_CHAR_PX tall.
        Operates on self.bgr unless a specific region array is supplied.
        """
        src = region if region is not None else self.bgr
        h, w = src.shape[:2]
        if factor is None:
            # Assume text occupies ~60% of strip height
            estimated_char_h = max(1, h * 0.6)
            factor = max(1, int(np.ceil(self._TARGET_CHAR_PX / estimated_char_h)))
        return cv2.resize(src, (w * factor, h * factor),
                          interpolation=cv2.INTER_CUBIC)

    def binarise_for_ocr(self,
                         region: np.ndarray,
                         invert:    bool = True,
                         threshold: int  = 110,
                         denoise:   bool = True) -> np.ndarray:
        """
        Convert a BGR region to a binarised image ready for Tesseract.

        Pipeline:
          1. Convert to greyscale
          2. Optional light denoising (GaussianBlur 3×3) — removes pixel speckle
             without blurring character edges
          3. CLAHE contrast enhancement — reuses self.clahe settings for
             consistency; applied to the region directly
          4. Thresholding:
             - threshold=0  → Otsu automatic threshold (best for variable backgrounds)
             - threshold>0  → fixed threshold (fast, reliable for known dark UI)
             - threshold=-1 → adaptive threshold (best for mixed-brightness strips)
          5. Optional invert (dark text on light background → white text on black)
        """
        gray = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)

        # Step 2: light denoise — GaussianBlur 3×3 removes pixel noise
        # without blurring character strokes (safe for UI screenshots)
        if denoise:
            gray = cv2.GaussianBlur(gray, (3, 3), 0)

        # Step 3: CLAHE using same settings as self.clahe for consistency
        _clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
        enh    = _clahe.apply(gray)

        # Step 4: threshold
        if threshold == 0:
            # Otsu — auto-picks optimal threshold for bimodal histograms
            _, thr = cv2.threshold(enh, 0, 255,
                                   cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        elif threshold == -1:
            # Adaptive — handles uneven lighting across the strip
            thr = cv2.adaptiveThreshold(
                enh, 255,
                cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY,
                blockSize=15, C=8
            )
        else:
            # Fixed — fast and reliable for known dark-UI backgrounds
            _, thr = cv2.threshold(enh, threshold, 255, cv2.THRESH_BINARY)

        if invert:
            thr = cv2.bitwise_not(thr)
        return thr

    def prepare_strip_for_ocr(self,
                               y1: int, y2: int,
                               x1: int = 0, x2: int = None,
                               scale: int = None,
                               threshold: int = 110,
                               invert: bool = True,
                               denoise: bool = True) -> np.ndarray:
        """
        Convenience: crop a strip, scale adaptively, binarise — all in one call.
        Returns a thresholded image ready for pytesseract.image_to_string().
        """
        x2    = x2 or self.width
        strip = self.bgr[max(0,y1):min(self.height,y2),
                         max(0,x1):min(self.width,x2)]
        if strip.size == 0:
            return np.zeros((4, 4), dtype=np.uint8)
        scaled = self.scale_up(factor=scale, region=strip)
        return self.binarise_for_ocr(scaled, invert=invert,
                                     threshold=threshold, denoise=denoise)
