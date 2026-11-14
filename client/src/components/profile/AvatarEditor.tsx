import { useRef, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { authFetch } from '@/lib/queryClient';
import { useMyProfile } from '@/components/profile/useMyProfile';
import { clampFrame, renderFrame, shownSize, MIN_ZOOM, MAX_ZOOM, type Frame } from '@/components/profile/avatarCrop';

/**
 * useAvatarEditor — pick a photo, FRAME it (drag to move, slide to zoom), save a square of exactly
 * that. One copy, used by the profile menu and the Settings page (2026-11-15).
 *
 * His words: "when someone uploads his pic it is not even visible." The old upload kept the picture's
 * shape and the round frame cropped it to the middle. See avatarCrop for the arithmetic.
 *
 * Returns `pick()` to open the file chooser and `element` to render once (the hidden file input and
 * the dialog). The dialog mounts INSIDE `.journal-root` so the journal's colours reach it.
 */
const V = 240;                       // viewport, px — fits a 320px phone with the dialog's padding
const MAX_FILE = 15 * 1024 * 1024;   // a phone camera photo is ~3-8 MB; past this something is wrong

export function useAvatarEditor(): { pick: () => void; element: ReactNode } {
  const { refresh } = useMyProfile();
  const input = useRef<HTMLInputElement>(null);
  const drag = useRef<{ px: number; py: number; f: Frame } | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [frame, setFrame] = useState<Frame>({ zoom: 1, x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pickErr, setPickErr] = useState('');

  const set = (f: Frame) => img && setFrame(clampFrame(f, img.naturalWidth, img.naturalHeight, V));
  const close = () => { setImg(null); setSrc(null); setErr(''); };

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPickErr('');
    if (!file.type.startsWith('image/')) { setPickErr('That file is not a picture.'); return; }
    if (file.size > MAX_FILE) { setPickErr('That picture is over 15 MB. Please choose a smaller one.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      const el = new Image();
      el.onload = () => { setImg(el); setSrc(url); setFrame({ zoom: 1, x: 0, y: 0 }); setErr(''); };
      el.onerror = () => setPickErr('This picture could not be opened. Use a PNG, JPEG or WebP.');
      el.src = url;
    };
    reader.onerror = () => setPickErr('The picture could not be read.');
    reader.readAsDataURL(file);
  }

  async function save() {
    if (!img) return;
    setBusy(true); setErr('');
    try {
      const avatarUrl = renderFrame(img, V, frame);
      const r = await authFetch('/api/me/avatar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d?.error || 'Could not save the photo.');
      }
      await refresh();
      close();
    } catch (e: any) {
      setErr(e?.message || 'Could not save the photo.');
    } finally { setBusy(false); }
  }

  const size = img ? shownSize(img.naturalWidth, img.naturalHeight, V, frame.zoom) : { W: V, H: V };
  const root = typeof document !== 'undefined' ? document.querySelector<HTMLElement>('.journal-root') : null;

  const element = (
    <>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={onFile} />
      {pickErr && !img && (
        <Dialog open onOpenChange={() => setPickErr('')}>
          <DialogContent container={root} className="max-w-sm bg-[var(--jr-panel,#111827)] text-[var(--jr-ink,#ECEEF2)] border-[var(--jr-border,rgba(255,255,255,0.08))] rounded-xl">
            <DialogHeader>
              <DialogTitle>Photo not added</DialogTitle>
              <DialogDescription className="text-[var(--jr-cap,#A8AEB8)]">{pickErr}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => { setPickErr(''); input.current?.click(); }}>Choose another</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      <Dialog open={!!img} onOpenChange={(o) => { if (!o && !busy) close(); }}>
        <DialogContent container={root} className="max-w-sm bg-[var(--jr-panel,#111827)] text-[var(--jr-ink,#ECEEF2)] border-[var(--jr-border,rgba(255,255,255,0.08))] rounded-xl">
          <DialogHeader>
            <DialogTitle>Position your photo</DialogTitle>
            <DialogDescription className="text-[var(--jr-cap,#A8AEB8)]">
              Drag to move it, use the slider to zoom. What is inside the circle is what people see.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-6">
            <div
              role="img" tabIndex={0} aria-label="Photo framing area. Arrow keys move the photo, plus and minus zoom."
              // clip-path AS WELL AS rounded-full: inside the dialog's open animation Chrome can paint an
              // overflow-hidden rounded box square for a frame (seen 2026-11-15). The cut must be a
              // circle every time, or people frame for corners they will never see.
              className="relative overflow-hidden rounded-full [clip-path:circle(50%)] cursor-grab active:cursor-grabbing touch-none select-none ring-1 ring-[var(--jr-border,rgba(255,255,255,0.12))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--jr-accent,#38bdf8)] bg-[repeating-conic-gradient(#808080_0%_25%,#a0a0a0_0%_50%)] bg-[length:16px_16px]"
              style={{ width: V, height: V }}
              onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, f: frame }; }}
              onPointerMove={(e) => { const d = drag.current; if (d) set({ ...d.f, x: d.f.x + e.clientX - d.px, y: d.f.y + e.clientY - d.py }); }}
              onPointerUp={() => { drag.current = null; }}
              onPointerCancel={() => { drag.current = null; }}
              onWheel={(e) => set({ ...frame, zoom: frame.zoom - e.deltaY * 0.002 })}
              onKeyDown={(e) => {
                const step = 8;
                const k: Record<string, Frame> = {
                  ArrowLeft: { ...frame, x: frame.x - step }, ArrowRight: { ...frame, x: frame.x + step },
                  ArrowUp: { ...frame, y: frame.y - step }, ArrowDown: { ...frame, y: frame.y + step },
                  '+': { ...frame, zoom: frame.zoom + 0.1 }, '=': { ...frame, zoom: frame.zoom + 0.1 },
                  '-': { ...frame, zoom: frame.zoom - 0.1 },
                };
                if (k[e.key]) { e.preventDefault(); set(k[e.key]); }
              }}
            >
              {src && (
                <img src={src} alt="" draggable={false} className="absolute max-w-none pointer-events-none"
                     style={{ width: size.W, height: size.H, left: V / 2 + frame.x - size.W / 2, top: V / 2 + frame.y - size.H / 2 }} />
              )}
            </div>
            <div className="flex w-full items-center gap-4">
              <span className="text-xs font-medium text-[var(--jr-cap,#A8AEB8)]">Zoom</span>
              <Slider aria-label="Zoom" min={MIN_ZOOM} max={MAX_ZOOM} step={0.01} value={[frame.zoom]}
                      onValueChange={([z]) => set({ ...frame, zoom: z })}
                      className="flex-1 [&>span:first-child]:bg-[var(--jr-border,rgba(255,255,255,0.18))] [&>span:first-child>span]:bg-[var(--jr-accent,#38bdf8)]" />
            </div>
            {err && <p role="alert" className="w-full rounded-lg bg-rose-500/10 px-4 py-2 text-sm text-rose-400">{err}</p>}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" disabled={busy} onClick={close}
                    className="bg-transparent text-[var(--jr-ink,#ECEEF2)] border-[var(--jr-border,rgba(255,255,255,0.12))] hover:bg-[var(--jr-divider,rgba(255,255,255,0.04))] hover:text-[var(--jr-ink,#ECEEF2)]">
              Cancel
            </Button>
            <Button disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save photo'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return { pick: () => input.current?.click(), element };
}
