import { useState, useEffect } from "react";
import { usePageTracking } from '@/hooks/usePageTracking';
import { usePublicTheme } from "@/context/PublicThemeContext";

const serif = { fontFamily: "'Playfair Display', serif" } as const;
const sans  = { fontFamily: "'Inter', sans-serif" } as const;

/* ── DST helpers ──────────────────────────────────────────────────────────── */
function lastSunday(year: number, monthIndex: number) {
  const d = new Date(Date.UTC(year, monthIndex + 1, 0));
  return d.getUTCDate() - d.getUTCDay();
}
function nthSunday(year: number, monthIndex: number, n: number) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const dow = first.getUTCDay();
  const firstSun = dow === 0 ? 1 : 8 - dow;
  return firstSun + (n - 1) * 7;
}
function isLondonBST(date: Date) {
  const y = date.getUTCFullYear();
  const start = new Date(Date.UTC(y, 2, lastSunday(y, 2), 1));
  const end   = new Date(Date.UTC(y, 9, lastSunday(y, 9), 1));
  return date >= start && date < end;
}
function isNewYorkEDT(date: Date) {
  const y = date.getUTCFullYear();
  const start = new Date(Date.UTC(y, 2,  nthSunday(y, 2,  2), 7));
  const end   = new Date(Date.UTC(y, 10, nthSunday(y, 10, 1), 6));
  return date >= start && date < end;
}

/* ── Types ────────────────────────────────────────────────────────────────── */
interface Session {
  id: string; name: string; start: number; end: number;
  tzLabel: string; color: string; dimColor: string;
  dst?: boolean; dstLabel?: string;
}

function getSessions(date: Date): Session[] {
  const bst = isLondonBST(date);
  const edt = isNewYorkEDT(date);
  return [
    { id: "sydney",   name: "Sydney",   start: 22, end: 7,
      tzLabel: "GMT+11 (AEST)",
      color: "#f97316", dimColor: "rgba(249,115,22,0.12)" },
    { id: "tokyo",    name: "Tokyo",    start: 0,  end: 9,
      tzLabel: "GMT+9 (JST)",
      color: "#8b5cf6", dimColor: "rgba(139,92,246,0.12)" },
    { id: "london",   name: "London",   start: bst ? 7 : 8, end: bst ? 16 : 17,
      tzLabel: bst ? "GMT+1 (BST)" : "GMT+0 (GMT)",
      dst: bst, dstLabel: bst ? "Summer — BST" : "Winter — GMT",
      color: "#0ea5e9", dimColor: "rgba(14,165,233,0.12)" },
    { id: "newyork",  name: "New York", start: edt ? 12 : 13, end: edt ? 21 : 22,
      tzLabel: edt ? "GMT-4 (EDT)" : "GMT-5 (EST)",
      dst: edt, dstLabel: edt ? "Summer — EDT" : "Winter — EST",
      color: "#10b981", dimColor: "rgba(16,185,129,0.12)" },
  ];
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function fmtDecimal(d: number) {
  const h = Math.floor(d), m = Math.round((d - h) * 60);
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}
function fmtDur(d: number) {
  const a = Math.abs(d), h = Math.floor(a), m = Math.floor((a - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
function fmtHMS(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sc = s % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sc).padStart(2,"0")}`;
}
// Forex trading week: opens Sunday 22:00 UTC (Sydney) and closes Friday 22:00 UTC (NY).
// A plain calendar weekday check is wrong at the edges — Sunday evening is already
// trading (Sydney open) and Friday night is already closed for the weekend.
function isMarketOpen(date: Date) {
  const day = date.getUTCDay();                       // 0=Sun .. 6=Sat
  const h   = date.getUTCHours() + date.getUTCMinutes() / 60;
  if (day === 6) return false;                        // Saturday — fully closed
  if (day === 0) return h >= 22;                      // Sunday — opens 22:00 UTC
  if (day === 5) return h < 22;                       // Friday — closes 22:00 UTC
  return true;                                        // Mon–Thu — open
}
function isLive(s: Session, t: number, weekday: boolean) {
  if (!weekday) return false;
  if (s.start < s.end) return t >= s.start && t < s.end;
  return t >= s.start || t < s.end;
}
function getMetrics(s: Session, t: number) {
  let total: number, elapsed: number;
  if (s.start < s.end) { total = s.end - s.start; elapsed = t - s.start; }
  else { total = 24 - s.start + s.end; elapsed = t >= s.start ? t - s.start : 24 - s.start + t; }
  const pct = Math.min(Math.max((elapsed / total) * 100, 0), 100);
  const remainSec = Math.max(0, (total - elapsed) * 3600);
  const opensInH  = s.start > t ? s.start - t : 24 - t + s.start;
  const opensInSec = opensInH * 3600;
  return { pct, remainSec, opensInSec, opensIn: fmtDur(opensInH), elapsed: fmtDur(elapsed) };
}
function hoursUntilMonday(date: Date) {
  const day = date.getUTCDay();
  const h = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  if (day === 0) return 24 - h;
  if (day === 6) return 24 - h + 24;
  return 0;
}

/* ── Pulsing dot ──────────────────────────────────────────────────────────── */
function PulsingDot({ color }: { color: string }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 10, height: 10 }}>
      <style>{`@keyframes tsc-ping{75%,100%{transform:scale(2.2);opacity:0}}.tsc-ping{animation:tsc-ping 1.5s cubic-bezier(0,0,.2,1) infinite}`}</style>
      <span className="tsc-ping" style={{ position: "absolute", width: 10, height: 10, borderRadius: "50%", background: color, opacity: 0.4 }} />
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block", position: "relative" }} />
    </span>
  );
}

/* ── Timeline ─────────────────────────────────────────────────────────────── */
function TimelineGrid({ sessions, decimalTime, weekday, darkMode }: { sessions: Session[]; decimalTime: number; weekday: boolean; darkMode: boolean }) {
  const needlePct = (decimalTime / 24) * 100;
  const bd = darkMode ? "#1e2740" : "#e2e8f0";

  return (
    <div style={{ border: `1px solid ${bd}`, overflow: "hidden" }}>
      {/* Hour labels */}
      <div style={{ display: "flex", borderBottom: `1px solid ${bd}`, background: darkMode ? "#0d1117" : "#f8fafc" }}>
        {Array.from({ length: 24 }, (_, i) => (
          <div key={i} style={{
            flex: 1, textAlign: "center", fontSize: 9, padding: "4px 0",
            fontFamily: "'DM Mono', monospace", color: "#374151",
            borderRight: i < 23 ? `1px solid ${bd}` : "none",
          }}>
            {String(i).padStart(2, "0")}
          </div>
        ))}
      </div>

      {/* Session bars */}
      <div style={{ position: "relative", padding: "8px 0", display: "flex", flexDirection: "column", gap: 5, background: darkMode ? undefined : "#ffffff" }}>
        {/* Vertical grid lines */}
        {Array.from({ length: 23 }, (_, i) => (
          <div key={i} style={{
            position: "absolute", top: 0, bottom: 0, width: 1,
            background: darkMode ? "#1a2235" : "#e2e8f0", left: `${((i + 1) / 24) * 100}%`,
            pointerEvents: "none",
          }} />
        ))}

        {sessions.map(s => {
          const live = isLive(s, decimalTime, weekday);
          const segments: { left: number; width: number }[] =
            s.start < s.end
              ? [{ left: (s.start / 24) * 100, width: ((s.end - s.start) / 24) * 100 }]
              : [
                  { left: (s.start / 24) * 100, width: ((24 - s.start) / 24) * 100 },
                  { left: 0,                     width: (s.end / 24) * 100 },
                ];

          return (
            <div key={s.id} style={{ position: "relative", height: 26 }}>
              {segments.map((seg, bi) => (
                <div key={bi} style={{
                  position: "absolute", top: 0, height: "100%",
                  left: `${seg.left}%`, width: `${seg.width}%`,
                  background: live ? s.dimColor : (darkMode ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.03)"),
                  borderLeft: `2px solid ${s.color}`,
                  opacity: live ? 1 : 0.45,
                  display: "flex", alignItems: "center", paddingLeft: 7, overflow: "hidden",
                  transition: "opacity 1s",
                }}>
                  {bi === 0 && (
                    <span style={{
                      fontFamily: "'DM Mono', monospace", fontSize: 9,
                      letterSpacing: "0.08em", color: live ? s.color : "#4b5563",
                      whiteSpace: "nowrap", transition: "color 1s",
                    }}>
                      {s.name}
                    </span>
                  )}
                </div>
              ))}
            </div>
          );
        })}

        {/* Time needle */}
        <div style={{
          position: "absolute", top: 0, bottom: 0, width: 2,
          background: "#3b82f6", left: `${needlePct}%`,
          zIndex: 10, transition: "left 1s linear",
        }}>
          <div style={{
            position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
            width: 8, height: 8, borderRadius: "50%", background: "#3b82f6",
          }} />
        </div>
      </div>
    </div>
  );
}

/* ── Session Card ─────────────────────────────────────────────────────────── */
function SessionCard({ s, decimalTime, weekday, darkMode }: { s: Session; decimalTime: number; weekday: boolean; darkMode: boolean }) {
  const live    = isLive(s, decimalTime, weekday);
  const metrics = getMetrics(s, decimalTime);
  const bd = darkMode ? "#1e2740" : "#e2e8f0";
  const cardBg = darkMode ? "#0d1117" : "#ffffff";
  const headerBg = live ? s.dimColor : (darkMode ? "#111827" : "#f8fafc");
  const bodyText = darkMode ? "#9ca3af" : "#374151";
  const mutedText = darkMode ? "#4b5563" : "#6b7280";

  return (
    <div
      data-testid={`card-session-${s.id}`}
      style={{
        background: cardBg,
        border: `1px solid ${bd}`,
        display: "flex", flexDirection: "column",
        transition: "border-color 0.4s",
      }}
    >
      {/* Card header */}
      <div style={{
        padding: "10px 14px",
        background: headerBg,
        borderBottom: `1px solid ${bd}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        transition: "background 0.4s",
      }}>
        <h3 style={{
          fontFamily: "'DM Mono', monospace", fontSize: 10,
          letterSpacing: "0.15em", textTransform: "uppercase",
          color: live ? s.color : "#6b7280", fontWeight: 500, margin: 0,
          transition: "color 0.4s",
        }}>
          {s.name}
        </h3>
        <span
          data-testid={`badge-${s.id}`}
          style={{
            fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: "0.12em",
            textTransform: "uppercase", fontWeight: 700, padding: "2px 8px",
            background: live ? s.color : (darkMode ? "#1e2740" : "#e2e8f0"),
            color: live ? "#fff" : mutedText,
            transition: "background 0.4s, color 0.4s",
          }}
        >
          {live ? "Live" : "Closed"}
        </span>
      </div>

      {/* Card body */}
      <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>

        {/* Timezone */}
        <div>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "#374151", marginBottom: 5 }}>
            Timezone
          </p>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 500, color: bodyText, margin: 0 }}>
            {s.tzLabel}
          </p>
          {s.dstLabel && (
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: mutedText, margin: "3px 0 0", letterSpacing: "0.06em" }}>
              {s.dstLabel}
            </p>
          )}
        </div>

        {/* Session hours */}
        <div>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "#374151", marginBottom: 5 }}>
            Hours (UTC)
          </p>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 500, color: bodyText, margin: 0 }}>
            {fmtDecimal(s.start)} — {fmtDecimal(s.end)}{s.start > s.end ? " +1d" : ""}
          </p>
        </div>

        {/* Progress bar */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: "#374151", textTransform: "uppercase" }}>
              Session Progress
            </span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: mutedText }}>
              {live ? `${Math.round(metrics.pct)}%` : "0%"}
            </span>
          </div>
          <div style={{ width: "100%", height: 3, background: darkMode ? "#1e2740" : "#e2e8f0" }}>
            <div style={{
              height: "100%",
              width: live ? `${metrics.pct}%` : "0%",
              background: s.color,
              transition: "width 1s linear",
            }} />
          </div>
        </div>

        {/* Countdown */}
        <div style={{ paddingTop: 12, borderTop: `1px solid ${bd}` }}>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "#374151", marginBottom: 5 }}>
            {live ? "Closing In" : weekday ? "Opening In" : "Opens Monday"}
          </p>
          <p style={{
            fontFamily: "'DM Mono', monospace", fontSize: 20, fontWeight: 500,
            color: live ? s.color : mutedText,
            letterSpacing: "0.03em", lineHeight: 1.2, margin: 0,
            transition: "color 0.4s",
          }}>
            {live
              ? fmtHMS(metrics.remainSec)
              : weekday
                ? fmtHMS(metrics.opensInSec)
                : fmtDur(hoursUntilMonday(new Date())) + " est."}
          </p>
        </div>

      </div>
    </div>
  );
}

/* ── Stats strip ──────────────────────────────────────────────────────────── */
function StatsStrip({ sessions, decimal, weekday, liveCount, darkMode }: { sessions: Session[]; decimal: number; weekday: boolean; liveCount: number; darkMode: boolean }) {
  const stats = [
    {
      label: "Active Sessions",
      value: weekday ? `${liveCount} / ${sessions.length}` : "0 / 4",
      sub: weekday ? "live right now" : "weekend",
      color: "#10b981",
    },
    {
      label: "Market Status",
      value: weekday ? "Open" : "Closed",
      sub: weekday ? "trading active" : "resumes monday",
      color: weekday ? "#10b981" : "#f97316",
    },
    {
      label: "Next Session",
      color: "#6366f1",
      value: (() => {
        if (!weekday) return "Sydney";
        const closed = sessions.filter(s => !isLive(s, decimal, weekday));
        if (!closed.length) return "All Live";
        return closed.map(s => ({ name: s.name, d: s.start > decimal ? s.start - decimal : 24 - decimal + s.start })).sort((a, b) => a.d - b.d)[0].name;
      })(),
      sub: (() => {
        if (!weekday) return "Mon open";
        const closed = sessions.filter(s => !isLive(s, decimal, weekday));
        if (!closed.length) return "none queued";
        const soonest = closed.map(s => ({ name: s.name, d: s.start > decimal ? s.start - decimal : 24 - decimal + s.start })).sort((a, b) => a.d - b.d)[0];
        return `in ${fmtDur(soonest.d)}`;
      })(),
    },
    {
      label: "Most Progress",
      color: "#8b5cf6",
      value: liveCount
        ? sessions.filter(s => isLive(s, decimal, weekday)).sort((a, b) => getMetrics(b, decimal).pct - getMetrics(a, decimal).pct)[0]?.name ?? "—"
        : "—",
      sub: liveCount
        ? `${Math.round(getMetrics(sessions.filter(s => isLive(s, decimal, weekday)).sort((a, b) => getMetrics(b, decimal).pct - getMetrics(a, decimal).pct)[0] ?? sessions[0], decimal).pct)}% elapsed`
        : "no live sessions",
    },
    {
      label: "UTC Offset",
      color: "#0ea5e9",
      value: (() => { const off = -new Date().getTimezoneOffset() / 60; return `${off >= 0 ? "+" : ""}${off}h`; })(),
      sub: "your local offset",
    },
  ];

  const bd = darkMode ? "#1e2740" : "#e2e8f0";
  return (
    <div style={{ border: `1px solid ${bd}`, background: darkMode ? "#111827" : "#ffffff" }}>
      <div style={{ padding: "10px 20px", borderBottom: `1px solid ${bd}` }}>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "#374151" }}>
          At a Glance
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 0 }}>
        {stats.map(({ label, value, sub, color }, i) => (
          <div key={label} style={{ padding: "16px 20px", borderRight: i < stats.length - 1 ? `1px solid ${bd}` : "none" }}>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "#374151", marginBottom: 6 }}>
              {label}
            </p>
            <p style={{ ...sans, fontSize: 18, fontWeight: 800, color, letterSpacing: "-0.01em", lineHeight: 1.1, marginBottom: 4 }}>
              {value}
            </p>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#4b5563" }}>
              {sub}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function TscPage() {
  usePageTracking('tsc');
  const [now, setNow] = useState(new Date());
  const { darkMode }  = usePublicTheme();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const h        = now.getUTCHours();
  const m        = now.getUTCMinutes();
  const sec      = now.getUTCSeconds();
  const decimal  = h + m / 60 + sec / 3600;
  const weekday  = isMarketOpen(now);   // "market open right now" — gates all live checks
  const SESSIONS = getSessions(now);
  const timeStr  = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")} UTC`;
  const liveCount = weekday ? SESSIONS.filter(s => isLive(s, decimal, true)).length : 0;
  const liveSessions = weekday ? SESSIONS.filter(s => isLive(s, decimal, true)) : [];
  const activeLabel  = liveSessions.length
    ? liveSessions.map(s => s.name).join("  ·  ")
    : (weekday ? "No Session Open" : "Markets Closed");
  const activeColor  = liveSessions.length ? "#10b981" : "#fbbf24";

  // Adapt theme — the page shell uses the public light/dark toggle,
  // but the session widget is always dark (matches the journal dark style)
  const pageBg   = darkMode ? "#080c10" : "#f0f4f8";
  const textPrim = darkMode ? "#f1f5f9" : "#0f172a";
  const textMuted= darkMode ? "#64748b" : "#64748b";
  const border   = darkMode ? "#1e2740" : "#e2e8f0";

  return (
    <>
      <div style={{ minHeight: "100vh", background: pageBg, ...sans, transition: "background 0.3s" }}>

        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section style={{ borderBottom: `1px solid ${border}`, padding: "52px 0 48px" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 28px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: 32 }}>

            <div style={{ flex: "1 1 380px" }}>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: textMuted, marginBottom: 8 }}>
                Active Market
              </p>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 14,
                fontFamily: "'DM Mono', monospace", fontSize: "clamp(1.4rem,2.5vw,2rem)",
                fontWeight: 500, letterSpacing: "0.04em", color: activeColor, lineHeight: 1,
                background: darkMode ? "#111827" : "#fff",
                border: `1px solid ${border}`, padding: "8px 20px", textTransform: "uppercase",
              }}>
                {liveSessions.length
                  ? <PulsingDot color={activeColor} />
                  : <span style={{ width: 9, height: 9, borderRadius: "50%", background: activeColor, display: "inline-block" }} />}
                {activeLabel}
              </div>
            </div>

            <div style={{ flex: "0 0 auto", textAlign: "right" }}>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: textMuted, marginBottom: 8 }}>
                Global Standard Time
              </p>
              <div style={{
                fontFamily: "'DM Mono', monospace", fontSize: "clamp(1.4rem,2.5vw,2rem)",
                fontWeight: 500, letterSpacing: "0.04em", color: textPrim, lineHeight: 1,
                background: darkMode ? "#111827" : "#fff",
                border: `1px solid ${border}`, padding: "8px 20px",
              }}>
                {timeStr}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                {SESSIONS.map(s => {
                  const live = isLive(s, decimal, weekday);
                  return (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 5, opacity: live ? 1 : 0.3, transition: "opacity 0.4s" }}>
                      <div style={{ width: 8, height: 8, background: s.color }} />
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: textMuted }}>{s.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </section>

        {/* ── Main Content ──────────────────────────────────────────────── */}
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "36px 28px 60px", display: "flex", flexDirection: "column", gap: 28 }}>

          {/* Timeline section */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "#374151", marginBottom: 4 }}>
                  Session Map
                </p>
                <h2 style={{ ...serif, fontSize: 20, fontWeight: 700, color: textPrim, margin: 0 }}>
                  24-Hour Market Timeline
                </h2>
              </div>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#4b5563" }}>
                Unit: 1 Hour Block
              </span>
            </div>
            <TimelineGrid sessions={SESSIONS} decimalTime={decimal} weekday={weekday} darkMode={darkMode} />
          </div>

          {/* Session cards */}
          <div>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "#374151", marginBottom: 12 }}>
              Active Sessions
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 1, background: darkMode ? "#1e2740" : "#e2e8f0" }}>
              {SESSIONS.map(s => (
                <SessionCard key={s.id} s={s} decimalTime={decimal} weekday={weekday} darkMode={darkMode} />
              ))}
            </div>
          </div>

          {/* Stats strip */}
          <StatsStrip sessions={SESSIONS} decimal={decimal} weekday={weekday} liveCount={liveCount} darkMode={darkMode} />


        </div>
      </div>
    </>
  );
}
