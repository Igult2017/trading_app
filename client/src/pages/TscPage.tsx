import { useState, useEffect } from "react";
import { usePageTracking } from '@/hooks/usePageTracking';
import { usePublicTheme } from "@/context/PublicThemeContext";

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
  region: string; zone: string; color: string;
  dimColor: string; borderColor: string; bgLight: string;
  dst?: boolean; dstLabel?: string;
}

function getSessions(date: Date): Session[] {
  const bst = isLondonBST(date);
  const edt = isNewYorkEDT(date);
  return [
    { id: "sydney",  name: "Sydney",   start: 22, end: 7,
      region: "Asia Pacific", zone: "AEST",
      color: "#f97316", dimColor: "rgba(249,115,22,0.10)", borderColor: "rgba(249,115,22,0.30)", bgLight: "#fff7ed" },
    { id: "tokyo",   name: "Tokyo",    start: 0,  end: 9,
      region: "Asia Pacific", zone: "JST",
      color: "#8b5cf6", dimColor: "rgba(139,92,246,0.10)", borderColor: "rgba(139,92,246,0.30)", bgLight: "#f5f3ff" },
    { id: "london",  name: "London",   start: bst ? 7 : 8, end: bst ? 16 : 17,
      region: "Europe", zone: bst ? "BST" : "GMT",
      dst: bst, dstLabel: bst ? "BST (summer)" : "GMT (winter)",
      color: "#0ea5e9", dimColor: "rgba(14,165,233,0.10)", borderColor: "rgba(14,165,233,0.30)", bgLight: "#f0f9ff" },
    { id: "newyork", name: "New York", start: edt ? 12 : 13, end: edt ? 21 : 22,
      region: "Americas", zone: edt ? "EDT" : "EST",
      dst: edt, dstLabel: edt ? "EDT (summer)" : "EST (winter)",
      color: "#10b981", dimColor: "rgba(16,185,129,0.10)", borderColor: "rgba(16,185,129,0.30)", bgLight: "#f0fdf4" },
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
function isWeekday(date: Date) {
  const day = date.getUTCDay(); return day >= 1 && day <= 5;
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
  const opensIn = s.start > t ? s.start - t : 24 - t + s.start;
  return { elapsed: fmtDur(elapsed), remaining: fmtDur(total - elapsed), pct, opensIn: fmtDur(opensIn) };
}
function hoursUntilMonday(date: Date) {
  const day = date.getUTCDay();
  const h = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  if (day === 0) return 24 - h;
  if (day === 6) return 24 - h + 24;
  return 0;
}

/* ── Sub-components ───────────────────────────────────────────────────────── */
function PulsingDot({ color }: { color: string }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 10, height: 10 }}>
      <style>{`@keyframes tsc-ping{75%,100%{transform:scale(2.2);opacity:0}}.tsc-ping{animation:tsc-ping 1.5s cubic-bezier(0,0,.2,1) infinite}`}</style>
      <span className="tsc-ping" style={{ position: "absolute", width: 10, height: 10, borderRadius: "50%", background: color, opacity: 0.4 }} />
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block", position: "relative" }} />
    </span>
  );
}

function TimelineBar({ sessions, decimalTime, weekday, dark }: { sessions: Session[]; decimalTime: number; weekday: boolean; dark: boolean }) {
  return (
    <div style={{ position: "relative", height: 28 }}>
      <div style={{ position: "absolute", inset: "10px 0", borderRadius: 99, background: dark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.07)", overflow: "hidden" }}>
        {sessions.map(s => {
          const live = isLive(s, decimalTime, weekday);
          if (s.start < s.end) return (
            <div key={s.id} style={{ position: "absolute", top: 0, bottom: 0, left: `${(s.start/24)*100}%`, width: `${((s.end-s.start)/24)*100}%`, background: s.color, opacity: live ? 0.85 : 0.18, transition: "opacity 1s" }} />
          );
          return [
            <div key={s.id+"a"} style={{ position: "absolute", top: 0, bottom: 0, left: `${(s.start/24)*100}%`, width: `${((24-s.start)/24)*100}%`, background: s.color, opacity: live ? 0.85 : 0.18, transition: "opacity 1s" }} />,
            <div key={s.id+"b"} style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${(s.end/24)*100}%`, background: s.color, opacity: live ? 0.85 : 0.18, transition: "opacity 1s" }} />,
          ];
        })}
      </div>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(decimalTime/24)*100}%`, width: 2, background: dark ? "#ffffff" : "#0f172a", borderRadius: 99, opacity: 0.7, transition: "left 1s linear", transform: "translateX(-1px)" }} />
    </div>
  );
}

function SessionCard({ s, decimalTime, weekday, dark }: { s: Session; decimalTime: number; weekday: boolean; dark: boolean }) {
  const live    = isLive(s, decimalTime, weekday);
  const metrics = getMetrics(s, decimalTime);
  // Cards render immediately — no fade-in delay that causes a blank flash.
  const inView = true;

  const cardBg    = dark ? (live ? "#0f172a" : "#0c1219") : (live ? "#ffffff" : "#ffffff");
  const cardBorder= live ? s.borderColor : (dark ? "#172233" : "#e2e8f0");
  const shadow    = live ? `0 4px 24px ${s.dimColor}, 0 1px 4px rgba(0,0,0,0.04)` : (dark ? "none" : "0 1px 4px rgba(0,0,0,0.04)");
  const labelClr  = dark ? "#64748b" : "#94a3b8";
  const textClr   = dark ? "#f1f5f9" : "#0f172a";
  const timeClr   = dark ? "#475569" : "#94a3b8";

  return (
    <div style={{
      background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 16,
      overflow: "hidden", boxShadow: shadow,
      opacity: inView ? 1 : 0, transform: inView ? "none" : "translateY(10px)",
      transition: "opacity 0.4s, transform 0.4s, border-color 0.4s, box-shadow 0.4s",
    }}>
      {/* Color accent top bar */}
      <div style={{ height: 3, background: s.color, opacity: live ? 1 : 0.25 }} />

      <div style={{ padding: "1.25rem 1.25rem 1.1rem" }}>
        {/* Header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              {live ? <PulsingDot color={s.color} /> : <span style={{ width: 7, height: 7, borderRadius: "50%", background: dark ? "#334155" : "#e2e8f0", display: "inline-block" }} />}
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: live ? s.color : labelClr }}>
                {live ? "Live" : s.region}
              </span>
            </div>
            <h3 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 900, letterSpacing: "-0.03em", color: textClr, fontFamily: "'Montserrat',sans-serif", lineHeight: 1 }}>
              {s.name}
            </h3>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ display: "inline-block", padding: "4px 10px", borderRadius: 6, background: live ? s.dimColor : (dark ? "rgba(255,255,255,0.04)" : "#f8fafc"), border: `1px solid ${live ? s.borderColor : (dark ? "rgba(255,255,255,0.08)" : "#e2e8f0")}` }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: live ? s.color : (dark ? "#475569" : "#94a3b8") }}>{s.zone}</div>
              {s.dstLabel && <div style={{ fontSize: 9, fontWeight: 600, color: s.dst ? "#fbbf24" : (dark ? "#475569" : "#94a3b8"), letterSpacing: "0.05em", marginTop: 2 }}>{s.dstLabel}</div>}
            </div>
          </div>
        </div>

        {/* Time range */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "1rem" }}>
          <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: timeClr }}>{fmtDecimal(s.start)}</span>
          <div style={{ flex: 1, height: 1, background: dark ? "rgba(255,255,255,0.07)" : "#f1f5f9" }} />
          <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: timeClr }}>{fmtDecimal(s.end)}{s.start > s.end ? " +1d" : ""}</span>
        </div>

        {/* Status body */}
        {live ? (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: labelClr, marginBottom: 3 }}>Elapsed</div>
                <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 800, color: textClr }}>{metrics.elapsed}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: labelClr, marginBottom: 3 }}>Closes In</div>
                <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 800, color: textClr }}>{metrics.remaining}</div>
              </div>
            </div>
            <div style={{ height: 4, borderRadius: 99, background: dark ? "rgba(255,255,255,0.06)" : "#f1f5f9", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${metrics.pct}%`, background: s.color, borderRadius: 99, transition: "width 1s cubic-bezier(.4,0,.2,1)" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: s.color }}>{Math.round(metrics.pct)}%</span>
            </div>
          </div>
        ) : (
          <div style={{ padding: "0.8rem 1rem", borderRadius: 10, textAlign: "center", background: dark ? "rgba(255,255,255,0.02)" : "#f8fafc", border: `1px dashed ${dark ? "rgba(255,255,255,0.08)" : "#e2e8f0"}` }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: labelClr, marginBottom: 4 }}>
              {weekday ? "Opens In" : "Closed — Weekend"}
            </div>
            <div style={{ fontFamily: "monospace", fontSize: "1rem", fontWeight: 800, color: dark ? "#475569" : "#94a3b8" }}>
              {weekday ? metrics.opensIn : fmtDur(s.start > decimalTime ? s.start - decimalTime : 24 - decimalTime + s.start) + " Mon"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function TscPage() {
  usePageTracking('tsc');
  const [now, setNow]         = useState(new Date());
  const { darkMode, setDarkMode } = usePublicTheme();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const dm       = darkMode;
  const h        = now.getUTCHours();
  const m        = now.getUTCMinutes();
  const sec      = now.getUTCSeconds();
  const decimal  = h + m / 60 + sec / 3600;
  const weekday  = isWeekday(now);
  const SESSIONS = getSessions(now);
  const timeStr  = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  const dateStr  = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const liveCount= weekday ? SESSIONS.filter(s => isLive(s, decimal, true)).length : 0;

  /* Theme tokens matching the landing page */
  const pageBg    = dm ? "#080c10"  : "#f8fafc";
  const cardBg    = dm ? "#0c1219"  : "#ffffff";
  const border    = dm ? "#172233"  : "#e2e8f0";
  const textPrim  = dm ? "#f1f5f9"  : "#0f172a";
  const textMuted = dm ? "#64748b"  : "#94a3b8";
  const sectionBg = dm ? "#060b14"  : "rgba(241,245,249,0.8)";

  const stats = [
    { label: "Active Sessions",  value: weekday ? `${liveCount} / ${SESSIONS.length}` : "0 / 4", sub: weekday ? "live right now" : "weekend", color: "#10b981" },
    { label: "Markets Status",   value: weekday ? "Open" : "Closed",                              sub: weekday ? "trading active" : "resumes monday", color: weekday ? "#10b981" : "#f97316" },
    {
      label: "Next Session", color: "#6366f1",
      value: (() => {
        if (!weekday) return "Sydney";
        const closed = SESSIONS.filter(s => !isLive(s, decimal, weekday));
        if (!closed.length) return "All Live";
        return closed.map(s => ({ name: s.name, d: s.start > decimal ? s.start - decimal : 24 - decimal + s.start })).sort((a,b) => a.d - b.d)[0].name;
      })(),
      sub: (() => {
        if (!weekday) return "Mon open";
        const closed = SESSIONS.filter(s => !isLive(s, decimal, weekday));
        if (!closed.length) return "no sessions queued";
        const soonest = closed.map(s => ({ name: s.name, d: s.start > decimal ? s.start - decimal : 24 - decimal + s.start })).sort((a,b) => a.d - b.d)[0];
        return `in ${fmtDur(soonest.d)}`;
      })(),
    },
    {
      label: "Most Progress", color: "#8b5cf6",
      value: liveCount ? SESSIONS.filter(s => isLive(s, decimal, weekday)).sort((a,b) => getMetrics(b, decimal).pct - getMetrics(a, decimal).pct)[0]?.name ?? "—" : "—",
      sub: liveCount ? `${Math.round(getMetrics(SESSIONS.filter(s => isLive(s, decimal, weekday)).sort((a,b) => getMetrics(b,decimal).pct - getMetrics(a,decimal).pct)[0] ?? SESSIONS[0], decimal).pct)}% elapsed` : "no live sessions",
    },
    {
      label: "UTC Offset", color: "#0ea5e9",
      value: (() => { const off = -now.getTimezoneOffset()/60; return `${off>=0?"+":""}${off}h`; })(),
      sub: "your local offset",
    },
  ];

  return (
    <>
      <div style={{ minHeight: "100vh", background: pageBg, fontFamily: "'Poppins', sans-serif", transition: "background 0.3s" }}>

        {/* ── Hero Section ──────────────────────────────────────────────── */}
        <section style={{ background: sectionBg, borderBottom: `1px solid ${border}`, padding: "56px 0 52px" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 28px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 40 }}>

            {/* Left: heading + description */}
            <div style={{ flex: "1 1 380px" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 16, padding: "5px 14px", borderRadius: 99, background: weekday ? "rgba(16,185,129,0.08)" : "rgba(251,191,36,0.08)", border: `1px solid ${weekday ? "rgba(16,185,129,0.25)" : "rgba(251,191,36,0.25)"}` }}>
                {weekday ? <PulsingDot color="#10b981" /> : <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fbbf24", display: "inline-block" }} />}
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: weekday ? "#10b981" : "#fbbf24" }}>
                  {weekday ? `${liveCount} Sessions Live` : "Weekend — Markets Closed"}
                </span>
              </div>
              <h1 style={{ margin: "0 0 12px", fontFamily: "'Montserrat',sans-serif", fontWeight: 900, fontSize: "clamp(2rem,4vw,3rem)", letterSpacing: "-0.03em", lineHeight: 1.05, color: textPrim }}>
                Trading Session<br />
                <span style={{ color: "#2563eb" }}>Clock</span>
              </h1>
              <p style={{ margin: "0 0 24px", fontSize: 15, fontWeight: 500, color: textMuted, lineHeight: 1.7, maxWidth: 440 }}>
                Track all four major forex market sessions in real time. See which markets are live, how much time remains, and when the next session opens.
              </p>
              {!weekday && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "10px 20px", borderRadius: 10, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24", letterSpacing: "0.04em" }}>
                    Markets reopen Monday · {fmtDur(hoursUntilMonday(now))} remaining
                  </span>
                </div>
              )}
            </div>

            {/* Right: live clock */}
            <div style={{ flex: "0 0 auto", textAlign: "right" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: textMuted, marginBottom: 6 }}>UTC Clock</div>
              <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: "clamp(1.5rem,2.5vw,2.1rem)", fontWeight: 700, letterSpacing: "-0.02em", color: textPrim, lineHeight: 1, transition: "color 0.3s" }}>
                {timeStr}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: textMuted, marginTop: 8, letterSpacing: "0.01em" }}>{dateStr}</div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                {SESSIONS.map(s => {
                  const live = isLive(s, decimal, weekday);
                  return (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 5, opacity: live ? 1 : 0.3, transition: "opacity 0.4s" }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: textMuted }}>{s.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ── Main Content ──────────────────────────────────────────────── */}
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 28px 60px", display: "flex", flexDirection: "column", gap: "2rem" }}>

          {/* Timeline */}
          <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 16, padding: "1.5rem 1.75rem", boxShadow: dm ? "none" : "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: textMuted, marginBottom: 3 }}>Session Map</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: textPrim }}>24-Hour UTC Timeline</div>
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {SESSIONS.map(s => {
                  const live = isLive(s, decimal, weekday);
                  return (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 5, opacity: live ? 1 : 0.35, transition: "opacity 0.4s" }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: textMuted }}>{s.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <TimelineBar sessions={SESSIONS} decimalTime={decimal} weekday={weekday} dark={dm} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              {[0,3,6,9,12,15,18,21,24].map(hr => (
                <span key={hr} style={{ fontSize: 9, fontWeight: 600, color: textMuted, opacity: 0.6 }}>{String(hr%24).padStart(2,"0")}</span>
              ))}
            </div>
          </div>

          {/* Session Cards */}
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: textMuted, marginBottom: 3 }}>Market Sessions</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: textPrim, fontFamily: "'Montserrat',sans-serif", letterSpacing: "-0.02em" }}>
                {liveCount > 0 ? `${liveCount} Session${liveCount > 1 ? "s" : ""} Active` : weekday ? "No Sessions Active" : "Markets Closed"}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "1rem" }}>
              {SESSIONS.map(session => (
                <SessionCard key={session.id} s={session} decimalTime={decimal} weekday={weekday} dark={dm} />
              ))}
            </div>
          </div>

          {/* Stats Strip */}
          <div style={{ background: sectionBg, border: `1px solid ${border}`, borderRadius: 16, padding: "1.5rem 1.75rem" }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: textMuted, marginBottom: 20 }}>At a Glance</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "0 2rem" }}>
              {stats.map(({ label, value, sub, color }, i) => (
                <div key={label}>
                  {i > 0 && <div style={{ height: 1, background: border, margin: "1.25rem 0", display: "block" }} />}
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: textMuted, marginBottom: 6 }}>{label}</div>
                  <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: "1.25rem", fontWeight: 900, color, letterSpacing: "-0.02em", lineHeight: 1, marginBottom: 4 }}>{value}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: textMuted }}>{sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Info blurb */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "1rem" }}>
            {[
              { title: "How Sessions Overlap", body: "The London–New York overlap (12:00–16:00 UTC) is historically the most volatile period. Both sessions are active and liquidity peaks during this window.", color: "#2563eb" },
              { title: "Daylight Saving Time", body: "London (BST) and New York (EDT) apply DST, shifting their sessions by ±1 hour. The clock adjusts automatically based on the current date.", color: "#8b5cf6" },
              { title: "Weekend Closure", body: "Forex markets close at 21:00 UTC Friday (New York close) and reopen 22:00 UTC Sunday (Sydney open). Crypto markets trade 24/7.", color: "#10b981" },
            ].map(({ title, body, color }) => (
              <div key={title} style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: "1.25rem 1.5rem", boxShadow: dm ? "none" : "0 1px 4px rgba(0,0,0,0.04)" }}>
                <div style={{ width: 3, height: 24, background: color, borderRadius: 99, marginBottom: 14 }} />
                <h3 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 800, color: textPrim, fontFamily: "'Montserrat',sans-serif", letterSpacing: "-0.01em" }}>{title}</h3>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: textMuted, lineHeight: 1.7 }}>{body}</p>
              </div>
            ))}
          </div>

        </div>
      </div>
    </>
  );
}
