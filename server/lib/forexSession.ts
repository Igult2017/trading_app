/**
 * Shared DST-aware forex session labeller — the single source for "what session
 * was this trade in". Used by both the synced-trade journaller (detectSession)
 * and the screenshot/manual journaller (deriveSessionFromTime), so they can never
 * drift apart. Same IANA-zone convention as the sessions page and the scanner.
 */

const WINDOWS = [
  { name: "Sydney",   tz: "Australia/Sydney", open: 8, close: 17 },
  { name: "Tokyo",    tz: "Asia/Tokyo",       open: 9, close: 18 },
  { name: "London",   tz: "Europe/London",    open: 8, close: 17 },
  { name: "New York", tz: "America/New_York", open: 8, close: 17 },
];

function localHour(tz: string, at: Date): number {
  return parseInt(at.toLocaleString("en-US", { timeZone: tz, hour: "2-digit", hour12: false }), 10) % 24;
}

function phaseOf(h: number, open: number, close: number): "Open" | "Mid" | "Close" {
  const span = close - open;
  return h < open + span / 3 ? "Open" : h < open + (2 * span) / 3 ? "Mid" : "Close";
}

/**
 * DST-aware session + phase for a UTC instant. Returns title-case names
 * (Sydney / Tokyo / London / New York / Overlap) or null when no major session
 * is active. London+New York both live ⇒ "Overlap".
 */
export function sessionAt(instant: Date): { sessionName: string; sessionPhase: string } | null {
  if (isNaN(instant.getTime())) return null;
  const active = WINDOWS
    .map(w => ({ w, h: localHour(w.tz, instant) }))
    .filter(({ w, h }) => h >= w.open && h < w.close);
  if (!active.length) return null;
  const names = active.map(a => a.w.name);
  if (names.includes("London") && names.includes("New York")) {
    const ny = active.find(a => a.w.name === "New York")!;
    return { sessionName: "Overlap", sessionPhase: phaseOf(ny.h, ny.w.open, ny.w.close) };
  }
  const primary = active[active.length - 1];   // Sydney→Tokyo→London→NY; later wins
  return { sessionName: primary.w.name, sessionPhase: phaseOf(primary.h, primary.w.open, primary.w.close) };
}
