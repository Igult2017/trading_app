import { C, cs, FONT, HFONT, R } from './tokens';

/**
 * The admin panel's shared building blocks.
 *
 * WHY THEY EXIST. The panel drew every card, title and badge inline, so proportions drifted screen
 * by screen — the headline number on the Overview was 15px against a 33px reference, the cards sat
 * 6px apart where the reference gives them 18, and no screen showed its own title at all. Those are
 * not colour problems, which is why re-skinning kept failing: the SIZES were wrong.
 */

/** The page's own heading: a tinted icon tile, the title in the display serif, and a line saying
 *  what the screen is for. The panel had `PAGE_TITLES` defined and never rendered, so every screen
 *  opened straight into content with nothing naming it. */
export function PageHeader({ icon: Icon, title, hint, right, hintStyle }: {
  icon?: React.ElementType; title: string; hint?: string; right?: React.ReactNode;
  /** Size and weight for the line under the title, when a screen wants something other than the
   *  default 13px. Both matter in a high-contrast face: they decide whether the thin strokes
   *  survive at all. */
  hintStyle?: React.CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
      {Icon && (
        <div style={{
          width: 44, height: 44, flex: '0 0 44px', borderRadius: 12,
          background: C.accentSoft, color: C.indigo,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={21} />
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <h1 style={{
          margin: 0, fontFamily: HFONT, fontSize: 28, fontWeight: 600,
          letterSpacing: '-0.01em', lineHeight: 1.1, color: C.text,
        }}>{title}</h1>
        {hint && (
          <p style={{ margin: '6px 0 0', fontFamily: FONT, fontSize: 13, fontWeight: 600, color: C.muted, lineHeight: 1.6, ...hintStyle }}>
            {hint}
          </p>
        )}
      </div>
      {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
    </div>
  );
}

/** A rounded status pill. Replaces the square bordered boxes the panel used for the same job. */
export function Pill({ tone = 'neutral', children }: {
  tone?: 'good' | 'bad' | 'warn' | 'neutral' | 'accent'; children: React.ReactNode;
}) {
  const map = {
    good:    { bg: 'rgba(16,185,129,0.12)', fg: C.green },
    bad:     { bg: 'rgba(220,38,38,0.10)',  fg: C.red },
    warn:    { bg: 'rgba(217,119,6,0.12)',  fg: C.amber },
    accent:  { bg: C.accentSoft,            fg: C.indigo },
    neutral: { bg: C.thead,                 fg: C.muted },
  }[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: map.bg, color: map.fg, borderRadius: R.pill,
      padding: '4px 10px', fontFamily: FONT, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

/** One headline figure.
 *
 *  THE NUMBER IS THE POINT OF THE CARD and it was 15px — smaller than some of the labels around it.
 *  It is 32px here, in the display serif, which is what makes the row read as a summary rather than
 *  a form. The icon tile is rounded and unbordered, and the trend is a pill, not a boxed outline. */
export function StatCard({ title, value, change, trend, caption, icon: Icon, tone = 'accent' }: {
  title: string; value: string; change?: string; trend?: 'up' | 'down';
  caption?: string; icon: React.ElementType; tone?: 'accent' | 'blue' | 'violet' | 'good';
}) {
  const tile = {
    accent: { bg: C.accentSoft,            fg: C.indigo },
    blue:   { bg: 'rgba(37,99,235,0.10)',  fg: C.blue },
    violet: { bg: 'rgba(109,40,217,0.10)', fg: '#6d28d9' },
    good:   { bg: 'rgba(16,185,129,0.12)', fg: C.green },
  }[tone];
  return (
    <div style={{ ...cs, padding: '20px 20px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{
          width: 38, height: 38, borderRadius: R.tile, background: tile.bg, color: tile.fg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={18} />
        </div>
        {change && change !== '—' && (
          <Pill tone={trend === 'down' ? 'bad' : 'good'}>{change}</Pill>
        )}
      </div>
      <div style={{
        fontFamily: HFONT, fontSize: 32, fontWeight: 600, color: C.text,
        letterSpacing: '-0.02em', lineHeight: 1,
      }}>{value}</div>
      <div style={{
        marginTop: 9, fontFamily: FONT, fontSize: 13, fontWeight: 700, color: C.muted,
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>{title}</div>
      {caption && (
        <div style={{ marginTop: 7, fontFamily: FONT, fontSize: 13, fontWeight: 600, color: C.muted }}>{caption}</div>
      )}
    </div>
  );
}

/** A content card with its own heading row. */
export function Panel({ title, hint, right, children, style }: {
  title?: string; hint?: string; right?: React.ReactNode;
  children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <div style={{ ...cs, overflow: 'hidden', ...style }}>
      {(title || right) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          padding: '18px 22px', borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{ minWidth: 0 }}>
            {title && <h2 style={{ margin: 0, fontFamily: HFONT, fontSize: 18, fontWeight: 600, color: C.text }}>{title}</h2>}
            {hint && <p style={{ margin: '3px 0 0', fontFamily: FONT, fontSize: 13, fontWeight: 600, color: C.muted }}>{hint}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}
