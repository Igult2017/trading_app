import React from 'react';

interface Props { darkMode: boolean }

export default function PhoneMockup({ darkMode: d }: Props) {
  const id = 'pm';

  // Colour tokens
  const screenBg  = d ? '#080d18' : '#f0f4ff';
  const frameTop  = d ? '#3a3f4a' : '#d4d8e0';
  const frameMid  = d ? '#1c2030' : '#b8bcc6';
  const frameBtm  = d ? '#2e3340' : '#cacdd6';
  const btnFill   = d ? '#2a2f3a' : '#c0c4cc';
  const homeBar   = d ? '#ffffff' : '#6b7280';
  const accent    = '#3b82f6';
  const accentLt  = '#60a5fa';
  const green     = '#22d3a5';
  const muted     = d ? '#475569' : '#94a3b8';
  const txt       = d ? '#e2e8f0' : '#1e293b';
  const cardBg    = d ? 'rgba(30,41,59,0.85)' : 'rgba(219,234,254,0.7)';
  const cardBdr   = d ? 'rgba(59,130,246,0.25)' : 'rgba(147,197,253,0.7)';
  const labelClr  = d ? '#64748b' : '#94a3b8';

  return (
    <div style={{ position: 'relative', width: 210, userSelect: 'none' }}>
      <svg
        viewBox="0 0 260 540"
        width="210"
        height="436"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block', filter: d ? 'drop-shadow(0 32px 64px rgba(0,0,0,0.8)) drop-shadow(0 0 40px rgba(59,130,246,0.12))' : 'drop-shadow(0 32px 64px rgba(0,0,0,0.18))' }}
      >
        <defs>
          {/* Phone body gradient */}
          <linearGradient id={`${id}-frame`} x1="0" y1="0" x2="260" y2="540" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor={frameTop} />
            <stop offset="50%"  stopColor={frameMid} />
            <stop offset="100%" stopColor={frameBtm} />
          </linearGradient>
          {/* Screen gradient */}
          <linearGradient id={`${id}-screen`} x1="0" y1="0" x2="0" y2="540" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor={screenBg} />
            <stop offset="100%" stopColor={d ? '#0c1526' : '#e8f0ff'} />
          </linearGradient>
          {/* Accent glow */}
          <linearGradient id={`${id}-accent`} x1="0" y1="0" x2="260" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor={accent} />
            <stop offset="100%" stopColor={accentLt} />
          </linearGradient>
          {/* Chart gradient */}
          <linearGradient id={`${id}-chart`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={accent} stopOpacity="0.35" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
          {/* Shine overlay */}
          <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%"   stopColor="white" stopOpacity={d ? "0.06" : "0.18"} />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* ── Outer phone body ── */}
        <rect x="0" y="0" width="260" height="540" rx="46" fill={`url(#${id}-frame)`} />

        {/* ── Side buttons ── */}
        {/* Silent / mute */}
        <rect x="-2" y="90"  width="3" height="26" rx="1.5" fill={btnFill} />
        {/* Vol up */}
        <rect x="-2" y="128" width="3" height="48" rx="1.5" fill={btnFill} />
        {/* Vol down */}
        <rect x="-2" y="186" width="3" height="48" rx="1.5" fill={btnFill} />
        {/* Power */}
        <rect x="259" y="148" width="3" height="68" rx="1.5" fill={btnFill} />

        {/* ── Inner bezel ── */}
        <rect x="4" y="4" width="252" height="532" rx="43" fill={d ? '#0f1420' : '#e8ecf2'} />

        {/* ── Screen ── */}
        <rect x="8" y="8" width="244" height="524" rx="39" fill={`url(#${id}-screen)`} />

        {/* ── Dynamic Island ── */}
        <rect x="92" y="20" width="76" height="26" rx="13" fill="#000" />
        <circle cx="150" cy="33" r="5" fill="#1a1a1a" />

        {/* ── Status bar ── */}
        <text x="26" y="54" fontFamily="ui-monospace,monospace" fontSize="10" fontWeight="500" fill={labelClr}>9:41</text>
        {/* Battery */}
        <rect x="214" y="47" width="18" height="9" rx="2" stroke={labelClr} strokeWidth="1" fill="none" />
        <rect x="232" y="50" width="2" height="3" rx="1" fill={labelClr} />
        <rect x="215" y="48" width="12" height="7" rx="1.2" fill={accent} />
        {/* Signal dots */}
        <circle cx="196" cy="51.5" r="2" fill={labelClr} />
        <circle cx="204" cy="51.5" r="2" fill={labelClr} />

        {/* ── App header ── */}
        <text x="26" y="80" fontFamily="Georgia,serif" fontSize="13" fontWeight="700" fill={d ? '#f1f5f9' : '#0f172a'}>Trade</text>
        <text x="67" y="80" fontFamily="Georgia,serif" fontSize="13" fontWeight="700" fill="#2563eb">&amp;</text>
        <text x="78" y="80" fontFamily="Georgia,serif" fontSize="13" fontWeight="700" fill={d ? '#f1f5f9' : '#0f172a'}>Journal</text>
        {/* Avatar circle */}
        <circle cx="228" cy="74" r="12" fill={`url(#${id}-accent)`} />
        <text x="222" y="78" fontFamily="sans-serif" fontSize="10" fontWeight="700" fill="white">AI</text>

        {/* ── Stat cards row ── */}
        {/* Card 1 — Total PnL */}
        <rect x="20" y="96" width="104" height="56" rx="12" fill={cardBg} stroke={cardBdr} strokeWidth="1" />
        <text x="32" y="113" fontFamily="ui-monospace,monospace" fontSize="7.5" fill={labelClr} letterSpacing="0.06em">TOTAL P&amp;L</text>
        <text x="32" y="132" fontFamily="ui-monospace,monospace" fontSize="13" fontWeight="600" fill={green}>+$11,869</text>
        <text x="32" y="143" fontFamily="ui-monospace,monospace" fontSize="7" fill={muted}>.48</text>

        {/* Card 2 — Win Rate */}
        <rect x="136" y="96" width="104" height="56" rx="12" fill={cardBg} stroke={cardBdr} strokeWidth="1" />
        <text x="148" y="113" fontFamily="ui-monospace,monospace" fontSize="7.5" fill={labelClr} letterSpacing="0.06em">WIN RATE</text>
        <text x="148" y="133" fontFamily="ui-monospace,monospace" fontSize="18" fontWeight="700" fill={txt}>80.7%</text>

        {/* Card 3 — Expectancy */}
        <rect x="20" y="162" width="104" height="50" rx="12" fill={cardBg} stroke={cardBdr} strokeWidth="1" />
        <text x="32" y="178" fontFamily="ui-monospace,monospace" fontSize="7.5" fill={labelClr} letterSpacing="0.06em">R EXPECTANCY</text>
        <text x="32" y="199" fontFamily="ui-monospace,monospace" fontSize="16" fontWeight="600" fill={txt}>1.868</text>

        {/* Card 4 — Trades */}
        <rect x="136" y="162" width="104" height="50" rx="12" fill={cardBg} stroke={cardBdr} strokeWidth="1" />
        <text x="148" y="178" fontFamily="ui-monospace,monospace" fontSize="7.5" fill={labelClr} letterSpacing="0.06em">TRADES</text>
        <text x="148" y="199" fontFamily="ui-monospace,monospace" fontSize="16" fontWeight="600" fill={txt}>69</text>

        {/* ── Equity Curve section ── */}
        <text x="26" y="232" fontFamily="ui-monospace,monospace" fontSize="8" fontWeight="700" fill={accent} letterSpacing="0.1em">↗  EQUITY CURVE</text>
        <text x="176" y="232" fontFamily="ui-monospace,monospace" fontSize="8" fontWeight="600" fill={green}>+304.19%</text>

        {/* Chart area background */}
        <rect x="20" y="238" width="220" height="78" rx="8" fill={d ? 'rgba(15,20,40,0.6)' : 'rgba(239,246,255,0.7)'} stroke={cardBdr} strokeWidth="0.5" />

        {/* Y-axis labels */}
        <text x="25" y="255" fontFamily="ui-monospace,monospace" fontSize="6.5" fill={muted}>15 m</text>
        <text x="25" y="275" fontFamily="ui-monospace,monospace" fontSize="6.5" fill={muted}>10 m</text>
        <text x="25" y="295" fontFamily="ui-monospace,monospace" fontSize="6.5" fill={muted}>5 m</text>
        <text x="25" y="311" fontFamily="ui-monospace,monospace" fontSize="6.5" fill={muted}>0</text>

        {/* Chart — area fill */}
        <path
          d="M50,308 L68,298 L90,295 L108,288 L128,280 L148,268 L166,258 L188,250 L208,248 L228,242 L228,315 L50,315 Z"
          fill={`url(#${id}-chart)`}
        />
        {/* Chart — line */}
        <polyline
          points="50,308 68,298 90,295 108,288 128,280 148,268 166,258 188,250 208,248 228,242"
          fill="none"
          stroke={`url(#${id}-accent)`}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Glow dot at end */}
        <circle cx="228" cy="242" r="3.5" fill={accentLt} />
        <circle cx="228" cy="242" r="6" fill={accentLt} fillOpacity="0.2" />

        {/* X-axis labels */}
        <text x="50"  y="323" fontFamily="ui-monospace,monospace" fontSize="6" fill={muted} textAnchor="middle">JAN</text>
        <text x="88"  y="323" fontFamily="ui-monospace,monospace" fontSize="6" fill={muted} textAnchor="middle">FEB</text>
        <text x="128" y="323" fontFamily="ui-monospace,monospace" fontSize="6" fill={muted} textAnchor="middle">MAR</text>
        <text x="168" y="323" fontFamily="ui-monospace,monospace" fontSize="6" fill={muted} textAnchor="middle">APR</text>
        <text x="208" y="323" fontFamily="ui-monospace,monospace" fontSize="6" fill={muted} textAnchor="middle">MAY</text>

        {/* ── Performance mix ── */}
        <text x="26" y="344" fontFamily="ui-monospace,monospace" fontSize="8" fontWeight="700" fill={labelClr} letterSpacing="0.1em">PERFORMANCE MIX</text>

        {/* Profit ratio */}
        <text x="26" y="360" fontFamily="ui-monospace,monospace" fontSize="7.5" fill={labelClr}>Profit ratio</text>
        <rect x="26" y="364" width="186" height="5" rx="2.5" fill={d ? '#1e293b' : '#dde6f0'} />
        <rect x="26" y="364" width="148" height="5" rx="2.5" fill={green} />
        <text x="218" y="370" fontFamily="ui-monospace,monospace" fontSize="7" fill={green}>79%</text>

        {/* Loss ratio */}
        <text x="26" y="382" fontFamily="ui-monospace,monospace" fontSize="7.5" fill={labelClr}>Loss ratio</text>
        <rect x="26" y="386" width="186" height="5" rx="2.5" fill={d ? '#1e293b' : '#dde6f0'} />
        <rect x="26" y="386" width="42" height="5" rx="2.5" fill="#f4617f" />
        <text x="218" y="392" fontFamily="ui-monospace,monospace" fontSize="7" fill="#f4617f">22%</text>

        {/* Volume */}
        <text x="26" y="404" fontFamily="ui-monospace,monospace" fontSize="7.5" fill={labelClr}>Pair vol / frequency</text>
        <rect x="26" y="408" width="186" height="5" rx="2.5" fill={d ? '#1e293b' : '#dde6f0'} />
        <rect x="26" y="408" width="94" height="5" rx="2.5" fill={accent} />
        <text x="218" y="414" fontFamily="ui-monospace,monospace" fontSize="7" fill={accent}>50%</text>

        {/* ── Activity bar ── */}
        <rect x="20" y="428" width="220" height="36" rx="8" fill={cardBg} stroke={cardBdr} strokeWidth="0.5" />
        <text x="30" y="443" fontFamily="ui-monospace,monospace" fontSize="7.5" fontWeight="700" fill={accent} letterSpacing="0.1em">↗  ACTIVITY</text>
        <text x="110" y="457" fontFamily="ui-monospace,monospace" fontSize="7" fill={labelClr} textAnchor="middle">JUNE 2026</text>
        <text x="210" y="457" fontFamily="ui-monospace,monospace" fontSize="10" fill={labelClr}>›</text>

        {/* ── Home indicator ── */}
        <rect x="100" y="516" width="60" height="4" rx="2" fill={homeBar} opacity="0.3" />

        {/* ── Shine overlay ── */}
        <rect x="8" y="8" width="244" height="524" rx="39" fill={`url(#${id}-shine)`} />
      </svg>
    </div>
  );
}
