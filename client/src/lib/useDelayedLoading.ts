import { useState, useEffect } from "react";

/**
 * Gate a loading indicator behind a short delay, so data that arrives quickly (or was already
 * cached) never shows one at all. Without it a 60ms fetch produces a skeleton that appears and
 * vanishes, which reads as a flicker rather than as loading.
 *
 * MOVED HERE 2026-09-06 from `components/TradingLoader.tsx`. That file held a spinning ring with a
 * progress bar that measured nothing — it was a timer that crept to 90% — and ten rotating
 * "Crunching your trade data…" messages. His instruction: *"remove it because i havent seen that
 * approach in any modern app."* The loader is gone; this hook had seven importers and is worth
 * keeping, so it lives on its own rather than in a file that no longer has a reason to exist.
 */
export function useDelayedLoading(isLoading: boolean, delay = 150): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!isLoading) { setShow(false); return; }
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [isLoading, delay]);
  return show;
}

export default useDelayedLoading;
