/**
 * avatarCrop — the arithmetic behind the photo framing step (AvatarEditor), kept free of React so it
 * can be checked on its own.
 *
 * WHY THERE IS A FRAMING STEP (2026-11-15). His words: "when someone uploads his pic it is not even
 * visible." The upload kept the picture's own shape and the round frame cropped it to the middle, so
 * a wide picture showed only "ADYTRAI". Now the person frames it themselves and what is saved is a
 * SQUARE of exactly that framing, which a round frame shows whole.
 *
 * The model: a square viewport of side V. The picture is scaled so its SHORT side fills V at zoom 1
 * (nothing empty at the edges), times `zoom`. `x`/`y` move the picture's centre away from the
 * viewport's centre, and are clamped so the picture always covers the viewport.
 */
export type Frame = { zoom: number; x: number; y: number };

export const OUTPUT_PX = 256;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/** Displayed size of the picture inside a V-wide viewport at this zoom. */
export function shownSize(w: number, h: number, V: number, zoom: number) {
  const base = V / Math.min(w, h);
  return { W: w * base * zoom, H: h * base * zoom };
}

/** Keep the picture covering the viewport: the centre may move at most half the overhang. */
export function clampFrame(f: Frame, w: number, h: number, V: number): Frame {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, f.zoom));
  const { W, H } = shownSize(w, h, V, zoom);
  const mx = Math.max(0, (W - V) / 2);
  const my = Math.max(0, (H - V) / 2);
  return { zoom, x: Math.min(mx, Math.max(-mx, f.x)), y: Math.min(my, Math.max(-my, f.y)) };
}

/** Where to draw the picture on an `out`-pixel square so it matches what the viewport shows. */
export function drawRect(w: number, h: number, V: number, f: Frame, out = OUTPUT_PX) {
  const { W, H } = shownSize(w, h, V, f.zoom);
  const k = out / V;
  return { dx: (V / 2 + f.x - W / 2) * k, dy: (V / 2 + f.y - H / 2) * k, dw: W * k, dh: H * k };
}

/** The server refuses more than 300,000 characters. Stay well under it. */
export const MAX_DATA_URL = 290_000;

/**
 * Render the framing to a data URL. WebP first: it keeps see-through areas (the old JPEG turned
 * them black) and is small. A browser that cannot write WebP hands back PNG instead; if that PNG is
 * over the server's limit, fall back to JPEG on white rather than fail the upload.
 */
export function renderFrame(img: HTMLImageElement, V: number, f: Frame): string {
  const c = document.createElement('canvas');
  c.width = OUTPUT_PX; c.height = OUTPUT_PX;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  const r = drawRect(img.naturalWidth, img.naturalHeight, V, f);
  ctx.drawImage(img, r.dx, r.dy, r.dw, r.dh);
  let url = c.toDataURL('image/webp', 0.9);
  if (url.length > MAX_DATA_URL || !/^data:image\/(webp|png)/.test(url)) {
    const j = document.createElement('canvas');
    j.width = OUTPUT_PX; j.height = OUTPUT_PX;
    const jc = j.getContext('2d')!;
    jc.fillStyle = '#ffffff'; jc.fillRect(0, 0, OUTPUT_PX, OUTPUT_PX);
    jc.drawImage(c, 0, 0);
    url = j.toDataURL('image/jpeg', 0.9);
  }
  return url;
}
