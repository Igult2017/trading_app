import { useState, useEffect, useMemo } from 'react';
import { getActiveSessions, getSessionElapsedMinutes, getSessionTimeRemaining, getMinutesUntilSessionOpen } from '@/lib/tradingSessions';

// ── Font import ───────────────────────────────────────────────────────────────
const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700;800;900&family=DM+Mono:wght@400;500&display=swap');`;

// ── Per-session colour tokens (dark-theme adapted) ────────────────────────────
const SESSION_META: Record<string, {
  color: string; bgActive: string; borderColor: string; textActive: string; timezone: string;
}> = {
  Sydney:    { color: '#7c3aed', bgActive: 'rgba(124,58,237,0.12)',  borderColor: '#7c3aed', textActive: '#a78bfa', timezone: 'GMT+11 (AEDT)' },
  Tokyo:     { color: '#d97706', bgActive: 'rgba(217,119,6,0.12)',   borderColor: '#d97706', textActive: '#fbbf24', timezone: 'GMT+9 (JST)'   },
  London:    { color: '#2563eb', bgActive: 'rgba(37,99,235,0.12)',   borderColor: '#2563eb', textActive: '#60a5fa', timezone: 'GMT+0 (GMT)'   },
  'New York':{ color: '#dc2626', bgActive: 'rgba(220,38,38,0.12)',   borderColor: '#dc2626', textActive: '#f87171', timezone: 'GMT-4 (EDT)'   },
};

// ── Timeline bar definitions (UTC hours) ─────────────────────────────────────
// Returns one or two {left%, width%} segments (Sydney wraps midnight)
function timelineBars(openUTC: number, closeUTC: number): { left: number; width: number }[] {
  if (openUTC < closeUTC) {
    return [{ left: (openUTC / 24) * 100, width: ((closeUTC - openUTC) / 24) * 100 }];
  }
  // wraps midnight
  return [
    { left: (openUTC / 24) * 100, width: ((24 - openUTC) / 24) * 100 },
    { left: 0,                     width: (closeUTC / 24) * 100       },
  ];
}

// ── Countdown formatters ──────────────────────────────────────────────────────
function fmtHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// Seconds until session closes (for active sessions)
function getSecondsUntilClose(openUTC: number, closeUTC: number): number {
  const now   = new Date();
  const nowS  = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
  const closeS = closeUTC * 3600;
  let diff: number;
  if (openUTC < closeUTC) {
    diff = closeS - nowS;
  } else {
    diff = nowS >= openUTC * 3600 ? (86400 - nowS + closeS) : (closeS - nowS);
  }
  return Math.max(0, diff);
}

// Seconds until session opens (for closed sessions)
function getSecondsUntilOpen(openUTC: number): number {
  const now  = new Date();
  const nowS = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
  const openS = openUTC * 3600;
  const diff  = openS > nowS ? openS - nowS : 86400 - nowS + openS;
  return Math.max(0, diff);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TradingSession() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const now      = useMemo(() => new Date(), [tick]);
  const sessions = useMemo(() => getActiveSessions(), [tick]);

  // UTC clock string
  const utcClock = now.toISOString().slice(11, 19) + ' UTC';

  // Time-needle position (% across 24h)
  const needlePct = useMemo(() => {
    const h = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
    return (h / 24) * 100;
  }, [tick]);

  return (
    <div
      data-testid="card-trading-session"
      style={{ fontFamily: "'Montserrat', sans-serif", background: '#0d1117', color: '#c9d1d9' }}
    >
      <style>{FONT_IMPORT}{`
        .ts-root * { box-sizing: border-box; }
        .ts-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>

      <div className="ts-root">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
          padding: '16px 20px 12px', borderBottom: '1px solid #1e2740',
        }}>
          <div>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#4b5563', marginBottom: 4 }}>
              Market Sessions
            </p>
            <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 13, fontWeight: 800, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#e5e7eb' }}>
              Trading Sessions
            </h2>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.12em', color: '#4b5563', marginBottom: 6, textTransform: 'uppercase' }}>
              Global Standard Time
            </p>
            <span
              data-testid="text-current-time"
              style={{
                fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 500,
                color: '#e5e7eb', background: '#111827',
                border: '1px solid #1e2740', padding: '4px 12px', letterSpacing: '0.05em',
              }}
            >
              {utcClock}
            </span>
          </div>
        </div>

        {/* ── 24-Hour Timeline ─────────────────────────────────────────────── */}
        <div style={{ padding: '16px 20px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 13, fontWeight: 700, color: '#e5e7eb' }}>
              24-Hour Market Timeline
            </h3>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#4b5563' }}>
              Unit: 1 Hour Block
            </span>
          </div>

          <div style={{ border: '1px solid #1e2740', background: '#111827', overflow: 'hidden' }}>
            {/* Hour labels */}
            <div style={{ display: 'flex', borderBottom: '1px solid #1e2740', background: '#0d1117' }}>
              {Array.from({ length: 24 }, (_, i) => (
                <div key={i} style={{
                  flex: 1, textAlign: 'center', fontSize: 9, padding: '4px 0',
                  fontFamily: "'DM Mono', monospace", color: '#374151',
                  borderRight: i < 23 ? '1px solid #1e2740' : 'none',
                }}>
                  {String(i).padStart(2, '0')}
                </div>
              ))}
            </div>

            {/* Session bars */}
            <div style={{ position: 'relative', padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Vertical grid lines */}
              {Array.from({ length: 23 }, (_, i) => (
                <div key={i} style={{
                  position: 'absolute', top: 0, bottom: 0, width: 1,
                  background: '#1e2740', left: `${((i + 1) / 24) * 100}%`,
                }}/>
              ))}

              {sessions.map(session => {
                const meta  = SESSION_META[session.name];
                const bars  = timelineBars(session.openUTC, session.closeUTC);
                return (
                  <div key={session.name} style={{ position: 'relative', height: 22 }}>
                    {bars.map((bar, bi) => (
                      <div key={bi} style={{
                        position: 'absolute', top: 0, height: '100%',
                        left: `${bar.left}%`, width: `${bar.width}%`,
                        background: session.isActive ? meta.bgActive : 'rgba(255,255,255,0.03)',
                        borderLeft: `2px solid ${meta.color}`,
                        opacity: session.isActive ? 1 : 0.45,
                        display: 'flex', alignItems: 'center', paddingLeft: 6, overflow: 'hidden',
                      }}>
                        {bi === 0 && (
                          <span style={{
                            fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.1em',
                            color: meta.color, whiteSpace: 'nowrap',
                          }}>
                            {session.name}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}

              {/* Time needle */}
              <div style={{
                position: 'absolute', top: 0, bottom: 0, width: 2,
                background: '#3b82f6', left: `${needlePct}%`, zIndex: 10,
                transition: 'left 1s linear',
              }}>
                <div style={{
                  position: 'absolute', top: -3, left: '50%', transform: 'translateX(-50%)',
                  width: 8, height: 8, borderRadius: '50%', background: '#3b82f6',
                }}/>
              </div>
            </div>
          </div>
        </div>

        {/* ── Session Cards ─────────────────────────────────────────────────── */}
        <div style={{ padding: 20 }}>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#4b5563', marginBottom: 12 }}>
            Active Sessions
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: '#1e2740' }}>
            {sessions.map(session => {
              const meta     = SESSION_META[session.name];
              const elapsed  = getSessionElapsedMinutes(session);
              const remaining = getSessionTimeRemaining(session);
              const total    = elapsed + remaining;
              const progress = total > 0 ? Math.round((elapsed / total) * 100) : 0;
              const closeSec = session.isActive ? getSecondsUntilClose(session.openUTC, session.closeUTC) : 0;
              const openSec  = !session.isActive ? getSecondsUntilOpen(session.openUTC) : 0;

              return (
                <div
                  key={session.name}
                  data-testid={`card-session-${session.name.toLowerCase()}`}
                  style={{ background: '#0d1117', display: 'flex', flexDirection: 'column' }}
                >
                  {/* Card header */}
                  <div style={{
                    padding: '10px 14px',
                    background: session.isActive ? meta.bgActive : '#111827',
                    borderBottom: '1px solid #1e2740',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  }}>
                    <h3 style={{
                      fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em',
                      textTransform: 'uppercase', color: '#9ca3af', fontWeight: 500,
                    }}>
                      {session.name}
                    </h3>
                    <span
                      data-testid={`badge-active-${session.name.toLowerCase()}`}
                      style={{
                        fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.12em',
                        textTransform: 'uppercase', fontWeight: 700,
                        padding: '2px 7px',
                        background: session.isActive ? meta.color : '#1e2740',
                        color: session.isActive ? '#fff' : '#4b5563',
                      }}
                    >
                      {session.isActive ? 'Live' : 'Closed'}
                    </span>
                  </div>

                  {/* Card body */}
                  <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                    {/* Timezone */}
                    <div>
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4b5563', marginBottom: 4 }}>
                        Timezone
                      </p>
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 500, color: '#9ca3af' }}>
                        {meta.timezone}
                      </p>
                    </div>

                    {/* Progress bar */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.1em', color: '#4b5563' }}>
                          Session Progress
                        </span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#4b5563' }}>
                          {session.isActive ? `${progress}%` : '0%'}
                        </span>
                      </div>
                      <div style={{ width: '100%', height: 3, background: '#1e2740' }}>
                        <div style={{
                          height: '100%',
                          width: session.isActive ? `${progress}%` : '0%',
                          background: meta.color,
                          transition: 'width 1s linear',
                        }}/>
                      </div>
                    </div>

                    {/* Countdown */}
                    <div style={{ paddingTop: 10, borderTop: '1px solid #1e2740' }}>
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4b5563', marginBottom: 4 }}>
                        {session.isActive ? 'Closing In' : 'Opening In'}
                      </p>
                      <p
                        data-testid={session.isActive ? `text-remaining-time-${session.name.toLowerCase()}` : `text-elapsed-time-${session.name.toLowerCase()}`}
                        style={{
                          fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 500,
                          color: session.isActive ? meta.textActive : '#6b7280',
                          letterSpacing: '0.04em', lineHeight: 1.2,
                        }}
                      >
                        {session.isActive ? fmtHMS(closeSec) : fmtHMS(openSec)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
