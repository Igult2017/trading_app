import React from 'react';

/**
 * StatCard — the Dashboard's headline card: a small caption over one big coloured figure.
 *
 * ⚠ IT LIVED INSIDE `pages/Journal.tsx` UNTIL 2026-11-14 and was MOVED here, not copied, when he
 * asked for the drawdown page's header to *"look like the header for the dashboard page but
 * displaying issues related with drawdown"*. Two copies of one card is how the two headers drift.
 *
 * Only `id`, `label`, `value` and `color` are drawn. The Dashboard's own stat objects also carry an
 * icon and a tint, which this card has never rendered; they are allowed through so that page's list
 * did not have to change shape for the move.
 *
 * The caption and figure use the journal's two shared text styles, `jr-cap` and `jr-fig`
 * (`Journal.tsx`, `.journal-root .jr-cap` / `.jr-fig`), so the font, size and weight follow the
 * journal rather than whichever panel the card sits in.
 */
export type Stat = { id: string; label: string; value: string; color: string; title?: string };

export const StatCard = ({ stat }: { stat: Stat }) => (
  <div style={{ background: 'var(--jr-panel,#0d1117)', border: '1px solid var(--jr-border,rgba(255,255,255,0.05))', padding: 12, borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}
       data-testid={`stat-${stat.id}`} title={stat.title}>
    <p className="jr-cap" style={{ margin: 0, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{stat.label}</p>
    {/* Playfair, and BIGGER because of it — see the .jr-fig rule in Journal.tsx for why the two go together. */}
    <p className="jr-fig" style={{ fontSize: 20, fontWeight: 700, color: stat.color, margin: 0 }}>{stat.value}</p>
  </div>
);
