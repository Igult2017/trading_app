import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

const FONT = "'Montserrat', sans-serif";
const GREEN  = "#00E5A0";
const RED    = "#FF3D5A";
const BG     = "#0A0D14";
const CARD   = "#0F1520";
const BORDER = "#1C2333";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS_FULL  = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
const DAYS_SHORT = ["S","M","T","W","T","F","S"];

type DayData = { pnl: number; trades: number; winRate: number };
type MonthData = Record<string, DayData>;

function fmt(pnl: number) {
  const sign = pnl >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(pnl).toFixed(2)}`;
}

function getStats(data: MonthData) {
  const days = Object.values(data);
  if (!days.length) return { net: 0, winRate: 0, trades: 0, ratio: "—", profitDays: 0, lossDays: 0, pct: "0.00" };
  const net      = days.reduce((s, d) => s + d.pnl, 0);
  const winDays  = days.filter(d => d.pnl > 0);
  const lossDays = days.filter(d => d.pnl < 0);
  const avgWin   = winDays.length  ? winDays.reduce((s,d)=>s+d.pnl,0)/winDays.length : 0;
  const avgLoss  = lossDays.length ? Math.abs(lossDays.reduce((s,d)=>s+d.pnl,0)/lossDays.length) : 0;
  const trades   = days.reduce((s,d)=>s+d.trades,0);
  const winRate  = Math.round(days.reduce((s,d)=>s+d.winRate,0)/days.length);
  const totalVol = days.reduce((s,d)=>s+Math.abs(d.pnl),0);
  const pct      = totalVol > 0 ? ((net/totalVol)*100).toFixed(2) : "0.00";
  return { net, winRate, trades, ratio: avgLoss ? (avgWin/avgLoss).toFixed(2) : "—", profitDays: winDays.length, lossDays: lossDays.length, pct };
}

function useWindowWidth() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return w;
}

function StatCard({ label, value, color, sub, compact }: { label: string; value: string | number; color: string; sub?: string; compact: boolean }) {
  return (
    <div style={{
      background: CARD,
      border: `2px solid ${BORDER}`,
      borderTop: `4px solid ${color}`,
      padding: compact ? "12px 14px" : "20px 24px",
      flex: 1, minWidth: 0,
    }} data-testid={`stat-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
      <div style={{ fontFamily: FONT, fontSize: compact ? 7 : 9, fontWeight: 800, letterSpacing: "0.15em", color: "#4A556A", textTransform: "uppercase" as const, marginBottom: compact ? 5 : 10 }}>{label}</div>
      <div style={{ fontFamily: FONT, fontSize: compact ? 16 : 26, fontWeight: 900, color, letterSpacing: "-0.03em", lineHeight: 1 }}>{value}</div>
      {sub && !compact && <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, color: "#3A4558", marginTop: 6, letterSpacing: "0.05em" }}>{sub}</div>}
    </div>
  );
}

function DayCell({ day, data, maxPnl, cellHeight, isMobile }: { day: number | null; data: MonthData; maxPnl: number; cellHeight: number; isMobile: boolean }) {
  const [hovered, setHovered] = useState(false);

  if (!day) return <div style={{ background: "#080B11", minHeight: cellHeight }} />;

  const d        = data[String(day)];
  const isProfit = d && d.pnl >= 0;
  const barWidth = d ? `${Math.round((Math.abs(d.pnl) / maxPnl) * 100)}%` : "0%";

  const bgColor = d
    ? isProfit ? `rgba(0,229,160,${hovered ? 0.1 : 0.06})` : `rgba(255,61,90,${hovered ? 0.1 : 0.06})`
    : hovered ? "rgba(255,255,255,0.02)" : CARD;

  const borderColor = d
    ? isProfit ? `rgba(0,229,160,${hovered ? 0.5 : 0.2})` : `rgba(255,61,90,${hovered ? 0.5 : 0.2})`
    : BORDER;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: bgColor, border: `1px solid ${borderColor}`,
        minHeight: cellHeight, padding: isMobile ? "5px" : "10px 12px",
        position: "relative", transition: "background 0.15s, border-color 0.15s",
        display: "flex", flexDirection: "column", justifyContent: "space-between", overflow: "hidden",
      }}
      data-testid={`cell-day-${day}`}
    >
      <div style={{
        fontFamily: FONT, fontSize: isMobile ? 8 : 11, fontWeight: 900,
        color: d ? (isProfit ? "rgba(0,229,160,0.5)" : "rgba(255,61,90,0.5)") : "#2A3348",
      }}>{String(day).padStart(2,"0")}</div>

      {d && (
        <div>
          <div style={{
            fontFamily: FONT, fontWeight: 900, lineHeight: 1,
            fontSize: isMobile ? 8 : 14,
            color: isProfit ? GREEN : RED,
            textShadow: isProfit ? "0 0 14px rgba(0,229,160,0.4)" : "0 0 14px rgba(255,61,90,0.4)",
            letterSpacing: isMobile ? 0 : "-0.02em",
            wordBreak: "break-all" as const,
          }}>{fmt(d.pnl)}</div>
          {!isMobile && (
            <div style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, color: "#2D3D52", marginTop: 3 }}>
              {d.trades}T · {d.winRate}%W
            </div>
          )}
        </div>
      )}

      {d && <div style={{ position: "absolute", bottom: 0, left: 0, height: 3, width: barWidth, background: isProfit ? GREEN : RED, opacity: 0.6 }} />}

      {d && hovered && !isMobile && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
          background: "#141C2E", border: `1px solid ${isProfit ? "rgba(0,229,160,0.3)" : "rgba(255,61,90,0.3)"}`,
          padding: "12px 16px", zIndex: 999, minWidth: 150, pointerEvents: "none" as const,
          boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
        }}>
          {[
            { l: "P&L",      v: fmt(d.pnl),     c: isProfit ? GREEN : RED },
            { l: "TRADES",   v: String(d.trades), c: "#E8EDF5" },
            { l: "WIN RATE", v: `${d.winRate}%`, c: "#E8EDF5" },
          ].map(r => (
            <div key={r.l} style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 5 }}>
              <span style={{ fontFamily: FONT, fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", color: "#3A4558" }}>{r.l}</span>
              <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 900, color: r.c }}>{r.v}</span>
            </div>
          ))}
          <div style={{
            position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
            borderLeft: "6px solid transparent", borderRight: "6px solid transparent",
            borderTop: `6px solid ${isProfit ? "rgba(0,229,160,0.3)" : "rgba(255,61,90,0.3)"}`,
          }} />
        </div>
      )}
    </div>
  );
}

export default function TradingCalendar({ sessionId }: { sessionId?: string | null }) {
  const now = new Date();
  const [date, setDate] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const width     = useWindowWidth();
  const isMobile  = width < 480;
  const isTablet  = width >= 480 && width < 768;

  const { data: calendarResult, isLoading, isError } = useQuery<{
    success: boolean;
    calendarData: Record<string, MonthData>;
    availableMonths: string[];
  }>({
    queryKey: [`/api/calendar/compute?sessionId=${sessionId}`],
    enabled: !!sessionId,
  });

  const allCalendarData = calendarResult?.calendarData || {};
  const key      = `${date.year}-${date.month}`;
  const data: MonthData = allCalendarData[key] || {};
  const stats    = getStats(data);
  const maxPnl   = Math.max(...Object.values(data).map(d => Math.abs(d.pnl)), 1);
  const netColor = stats.net >= 0 ? GREEN : RED;

  const firstDay    = new Date(date.year, date.month - 1, 1).getDay();
  const daysInMonth = new Date(date.year, date.month, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  function changeMonth(dir: number) {
    setDate(prev => {
      let m = prev.month + dir, y = prev.year;
      if (m > 12) { m = 1; y++; }
      if (m < 1)  { m = 12; y--; }
      return { year: y, month: m };
    });
  }

  const cellHeight = isMobile ? 58 : isTablet ? 80 : 110;
  const pad        = isMobile ? "14px 10px" : isTablet ? "22px 18px" : "36px 32px";
  const dayLabels  = isMobile ? DAYS_SHORT : DAYS_FULL;
  const compact    = isMobile || isTablet;

  if (!sessionId) {
    return (
      <div style={{ background: BG, minHeight: "100vh", fontFamily: FONT, padding: pad, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: "#E8EDF5", letterSpacing: "0.15em", marginBottom: 12 }}>
            TRADING<span style={{ color: GREEN }}>_</span>CALENDAR
          </div>
          <p style={{ fontSize: 11, color: "#3A4558", fontWeight: 800 }} data-testid="text-no-session-calendar">Select or create a session to view your trading calendar.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ background: BG, minHeight: "100vh", fontFamily: FONT, padding: pad, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={24} style={{ color: GREEN, animation: "spin 1s linear infinite" }} />
        <span style={{ marginLeft: 12, fontSize: 11, color: "#3A4558", fontWeight: 800 }}>Loading calendar data...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ background: BG, minHeight: "100vh", fontFamily: FONT, padding: pad, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontSize: 11, color: RED, fontWeight: 800 }} data-testid="text-calendar-error">Failed to load calendar data. Please try again.</p>
      </div>
    );
  }

  return (
    <div style={{ background: BG, minHeight: "100vh", fontFamily: FONT, padding: pad }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&display=swap'); @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div style={{
        display: "flex", alignItems: isMobile ? "flex-start" : "flex-end",
        flexDirection: isMobile ? "column" : "row",
        justifyContent: "space-between", gap: 12, marginBottom: isMobile ? 12 : 24,
      }}>
        <div>
          <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.28em", color: "#2A3348", marginBottom: 5 }}>PERFORMANCE OVERVIEW</div>
          <div style={{ fontSize: 13, fontWeight: 900, color: "#E8EDF5", letterSpacing: "0.15em" }}>
            TRADING<span style={{ color: GREEN }}>_</span>CALENDAR
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center" }}>
          <button onClick={() => changeMonth(-1)} data-testid="button-prev-month" style={{
            background: CARD, border: `2px solid ${BORDER}`, borderRight: "none",
            color: "#E8EDF5", width: isMobile ? 32 : 40, height: isMobile ? 32 : 40,
            cursor: "pointer", fontFamily: FONT, fontWeight: 900, fontSize: 15,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>←</button>
          <div style={{
            background: CARD, border: `2px solid ${BORDER}`,
            padding: isMobile ? "0 10px" : "0 20px",
            height: isMobile ? 32 : 40,
            display: "flex", alignItems: "center",
            fontSize: isMobile ? 8 : 11, fontWeight: 900, letterSpacing: "0.1em", color: "#E8EDF5", whiteSpace: "nowrap" as const,
          }} data-testid="text-current-month">
            {isMobile ? `${MONTH_NAMES[date.month-1].slice(0,3).toUpperCase()} ${date.year}` : `${MONTH_NAMES[date.month-1].toUpperCase()} ${date.year}`}
          </div>
          <button onClick={() => changeMonth(1)} data-testid="button-next-month" style={{
            background: CARD, border: `2px solid ${BORDER}`, borderLeft: "none",
            color: "#E8EDF5", width: isMobile ? 32 : 40, height: isMobile ? 32 : 40,
            cursor: "pointer", fontFamily: FONT, fontWeight: 900, fontSize: 15,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>→</button>
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)",
        gap: 2, marginBottom: 2,
      }}>
        <StatCard label="Net P&L"       value={fmt(stats.net)}      color={netColor} sub={`${stats.profitDays}W / ${stats.lossDays}L`} compact={compact} />
        <StatCard label="Win Rate"       value={`${stats.winRate}%`} color={GREEN}    sub={`${stats.profitDays} profit days`}            compact={compact} />
        <StatCard label="Total Trades"   value={stats.trades}        color="#4D9FFF"  sub="All active days"                              compact={compact} />
        <StatCard label="W/L Ratio"      value={stats.ratio}         color="#E8EDF5"  sub="Avg win / avg loss"                           compact={compact} />
      </div>

      <div style={{ border: `2px solid ${BORDER}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: `2px solid ${BORDER}` }}>
          {dayLabels.map((d, i) => (
            <div key={i} style={{
              padding: isMobile ? "7px 0" : "11px 0",
              textAlign: "center" as const, fontSize: isMobile ? 8 : 9, fontWeight: 900,
              letterSpacing: isMobile ? "0.02em" : "0.18em",
              color: i === 0 || i === 6 ? "#2A3D52" : "#3A4A62",
              borderRight: i < 6 ? `1px solid ${BORDER}` : "none",
              background: "#080B11",
            }}>{d}</div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
          {cells.map((day, i) => {
            const isLastRow = i >= cells.length - 7;
            const isLastCol = (i + 1) % 7 === 0;
            return (
              <div key={i} style={{
                borderRight:  !isLastCol ? `1px solid ${BORDER}` : "none",
                borderBottom: !isLastRow ? `1px solid ${BORDER}` : "none",
              }}>
                <DayCell day={day} data={data} maxPnl={maxPnl} cellHeight={cellHeight} isMobile={isMobile} />
              </div>
            );
          })}
        </div>
      </div>

      <div style={{
        display: "flex", alignItems: isMobile ? "flex-start" : "center",
        flexDirection: isMobile ? "column" : "row",
        justifyContent: "space-between", gap: 10, marginTop: 12,
      }}>
        <div style={{ display: "flex", gap: isMobile ? 10 : 18, flexWrap: "wrap" as const }}>
          {[{ dot: GREEN, label: "PROFIT" }, { dot: RED, label: "LOSS" }, { dot: "#2A3348", label: "NO TRADE" }].map(({ dot, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, background: dot }} />
              <span style={{ fontSize: isMobile ? 7 : 9, fontWeight: 800, letterSpacing: "0.12em", color: "#2A3348" }}>{label}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12, flexWrap: "wrap" as const }}>
          <span style={{ fontSize: isMobile ? 7 : 9, fontWeight: 800, letterSpacing: "0.18em", color: "#2A3348" }}>MONTH TOTAL</span>
          <div style={{ width: 1, height: 14, background: BORDER }} />
          <span style={{ fontSize: isMobile ? 11 : 13, fontWeight: 900, color: netColor }} data-testid="text-month-total">{fmt(stats.net)}</span>
          <div style={{ width: 1, height: 14, background: BORDER }} />
          <span style={{ fontSize: isMobile ? 11 : 13, fontWeight: 900, color: netColor }} data-testid="text-month-pct">{stats.net >= 0 ? "+" : ""}{stats.pct}%</span>
        </div>
      </div>
    </div>
  );
}
