import React from 'react';
import { Flame } from 'lucide-react';
import { fmtRange } from '@/components/drawdown/ddBits';

/**
 * ddStreaks — "Loss Streaks & Sequence", from his 2026-11-03 mock-up.
 *
 * From `streaks` (server/python/drawdown/streaks.py): the longest loss run and when it happened, the
 * average run before recovery, how often a streak was followed by revenge trading, the best winning
 * run, and the ordered outcome timeline.
 *
 * ⚠ THE TIMELINE IS CAPPED AT THE MOST RECENT 60 TRADES. His mock-up spells each outcome out in full
 * ("Break-even") against a seven-trade account, which is legible; a year of trading would be several
 * hundred of those chips wrapping down the page and burying every section under it. The cap is
 * stated on screen rather than silently applied, and the figures above it still cover every trade.
 */
const MAX_CHIPS = 60;

function Stat({ label, value, sub, cls }: { label: string; value: React.ReactNode; sub: string; cls: string }) {
  return (
    <div className="dd-inner-sm" style={{ display: 'block', padding: 12 }}>
      <span className="fs-11 c-dim" style={{ display: 'block' }}>{label}</span>
      <div className={`fs-2xl fw-bold dd-serif ${cls}`} style={{ marginTop: 2 }}>{value}</div>
      <span className="fs-10 c-faint">{sub}</span>
    </div>
  );
}

export function DdStreaks({ sk }: { sk: any }) {
  const timeline: string[] = (sk?.timeline ?? []).map((t: any) => String(t?.result ?? ''));
  const shown = timeline.slice(-MAX_CHIPS);
  const hidden = timeline.length - shown.length;

  const chip = (c: string) => {
    const up = c.toUpperCase();
    if (up === 'W') return { cls: 'dd-seq-win', text: 'Win' };
    if (up === 'L') return { cls: 'dd-seq-loss', text: 'Loss' };
    return { cls: 'dd-seq-be', text: 'Break-even' };
  };

  return (
    <div className="dd-card dd-colbetween" style={{ gap: 16 }}>
      <div>
        <div className="dd-between" style={{ marginBottom: 12 }}>
          <h3 className="dd-title">Loss Streaks &amp; Sequence</h3>
          <span className="dd-ico-badge ico-amber" aria-hidden><Flame width={16} height={16} /></span>
        </div>

        <div className="dd-grid dd-mono"
             style={{ gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginBottom: 16 }}>
          <Stat label="Max Loss Streak" cls="c-rose"
                value={sk?.maxLossStreak?.length ?? 0}
                sub={fmtRange(sk?.maxLossStreak?.startDate, sk?.maxLossStreak?.endDate) || 'no data'} />
          <Stat label="Avg Loss Streak" cls="c-ink"
                value={sk?.avgLossStreak ?? 0} sub="before recovery" />
          <Stat label="Post-Streak Revenge"
                cls={Number(sk?.revengeRate ?? 0) > 0 ? 'c-rose' : 'c-emerald'}
                value={`${sk?.revengeRate ?? 0}%`} sub="of streaks triggered" />
          <Stat label="Best Win Streak" cls="c-emerald"
                value={sk?.bestWinStreak?.length ?? 0}
                sub={fmtRange(sk?.bestWinStreak?.startDate, sk?.bestWinStreak?.endDate) || 'no data'} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="dd-between fs-xs c-dim fw-semi" style={{ gap: 8 }}>
            <span>Trade Timeline Sequence</span>
            <span className="dd-mono fs-11 c-faint">
              {timeline.length} execution{timeline.length === 1 ? '' : 's'}
              {hidden > 0 ? ` · showing last ${MAX_CHIPS}` : ''}
            </span>
          </div>
          <div className="dd-seq">
            {shown.length === 0
              ? <span className="dd-empty">No closed trades yet.</span>
              : shown.map((c, i) => {
                  const k = chip(c);
                  return <div key={i} className={`dd-seq-chip ${k.cls}`} title={k.text}>{k.text}</div>;
                })}
          </div>
        </div>
      </div>
    </div>
  );
}
