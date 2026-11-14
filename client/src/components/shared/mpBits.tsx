import React from 'react';
import { MP_REF } from '@/components/shared/mpTokens';

/**
 * mpBits — the Analytics page's card pieces, shared.
 *
 * ⚠ THEY LIVED INSIDE `MetricsPanel.tsx` UNTIL 2026-11-14 and were MOVED here, not copied, when he
 * asked for the drawdown page to get Analytics' "Period Summary" card back "with content related to
 * drawdown". The drawdown page builds its summary from these exact pieces, so the two cards cannot
 * drift apart. `MONO` also lived in a THIRD place (a copy inside shared/EquityCurveChart) and now
 * lives only here.
 *
 *   Panel — the card: a title strip with an optional badge, then its rows
 *   Row   — one label/value line with a hairline under it
 *   DR    — a Row whose value is a single coloured figure
 *   Chip  — the small rounded badge
 *
 * Every colour is an `--mp-*` variable with its dark value as the fallback (shared/mpTokens). A page
 * that borrows these must set the light values for the tokens they use — the drawdown page does it
 * in its stylesheet from `DD_PAGE_MP_TOKENS`.
 */
const D = MP_REF;

/** ⚠ `--mp-font` FIRST (2026-11-15). Analytics never sets it, so it keeps JetBrains Mono. The drawdown
 *  page sets it to its own face (`--dd-mono`), because he called the mono "that funny font type" there
 *  and asked for the page's own font across the chart and the summary. */
export const MONO: React.CSSProperties = {
  fontFamily: "var(--mp-font, 'JetBrains Mono Variable', 'JetBrains Mono', 'Fira Mono', 'Courier New', monospace)",
};

/** One header height for a card strip, so two cards standing side by side end their header on the
 *  SAME line (his 2026-11-15 ask, drawn as a white line across both). A MINIMUM, not a fixed height:
 *  a strip that has to wrap on a phone still can — the two cards stack there anyway. */
export const MP_HEAD_H = 44;

export type ChipVariant = 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'cyan' | 'gray' | 'neutral';

export const chipColors: Record<ChipVariant, { bg: string; color: string; border: string }> = {
  green:   { bg: D.greenBg,  color: D.green,  border: D.greenBd },
  red:     { bg: D.redBg,    color: D.red,     border: D.redBd },
  amber:   { bg: D.amberBg,  color: D.amber,   border: D.amberBd },
  blue:    { bg: D.blueBg,   color: D.blue,    border: D.blueBd },
  purple:  { bg: D.purpleBg, color: D.purple,  border: D.purpleBd },
  cyan:    { bg: D.cyanBg,   color: D.cyan,    border: D.cyanBd },
  gray:    { bg: D.grayBg,   color: D.gray,    border: D.grayBd },
  neutral: { bg: D.grayBg,   color: D.sub,     border: D.grayBd },
};

export const Chip = ({ children, variant = 'neutral' as ChipVariant }: { children: React.ReactNode; variant?: ChipVariant }) => {
  const c = chipColors[variant] || chipColors.neutral;
  return (
    <span style={{
      ...MONO,
      fontSize: 13.5, fontWeight: 600,
      padding: '1px 6px', borderRadius: 20,
      background: c.bg, color: c.color, border: `0.5px solid ${c.border}`,
      letterSpacing: '0.04em', whiteSpace: 'nowrap' as const, lineHeight: '16px',
    }}>
      {children}
    </span>
  );
};

export const Panel = ({ title, badge, badgeColor = 'gray' as ChipVariant, children, style = {} as React.CSSProperties, headHeight }: any) => (
  <div style={{ background: D.bg3, border: `0.5px solid ${D.bdInner}`, borderRadius: 10, overflow: 'hidden', ...style }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderBottom: `0.5px solid ${D.bdInner}`, background: D.bg4, ...(headHeight ? { minHeight: headHeight, boxSizing: 'border-box' as const } : {}) }}>
      <span style={{ ...MONO, fontSize: 13.5, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: D.label }}>
        {title}
      </span>
      {badge && <Chip variant={badgeColor as ChipVariant}>{badge}</Chip>}
    </div>
    <div style={{ padding: '8px 12px 10px' }}>{children}</div>
  </div>
);

export const Row = ({ label, children, noBorder = false }: { label: React.ReactNode; children?: React.ReactNode; noBorder?: boolean }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: noBorder ? 'none' : `0.5px solid ${D.bdRow}` }}>
    <span style={{ ...MONO, fontSize: 14.5, color: D.muted, display: 'flex', alignItems: 'center', gap: 6 }}>{label}</span>
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>{children}</div>
  </div>
);

export const DR = ({ label, value, vc }: { label: string; value: string; vc?: string }) => (
  <Row label={label}>
    <span style={{ ...MONO, fontSize: 14.5, fontWeight: 600, color: vc || D.text }}>{value}</span>
  </Row>
);
