import React from 'react';
import { Zap } from 'lucide-react';

/**
 * ddBanner — the status strip under the header, from his 2026-11-03 mock-up.
 *
 * ⚠ THE MOCK-UP ONLY DREW THE HAPPY STATE ("Current drawdown is fully recovered"), because the
 * account it was drawn against happened to be at its peak. A banner that says that while you are 4%
 * underwater would be worse than no banner, so both states are written out here and the wording is
 * chosen by `inDrawdown` — which the API already reports
 * (`intelligence.current.inDrawdown`, server/python/drawdown/intelligence.py).
 */
export function DdBanner({ cur, uw }: { cur: any; uw: any }) {
  const inDd = !!cur?.inDrawdown;
  const ddPct = Number(cur?.ddPct ?? 0);
  const trades = Number(cur?.tradesSincePeak ?? 0);
  const days = cur?.daysSincePeak;

  // Duration reads from the CURRENT episode when underwater, and from the worst recorded one when
  // at peak — because "how long was I ever down" is the useful number once you are back up.
  const durTrades = inDd ? Number(uw?.currentUnderwaterTrades ?? trades) : Number(uw?.longestTrades ?? 0);
  const durDays = inDd ? (days ?? 0) : Number(uw?.longestDays ?? 0);

  return (
    <div className="dd-banner">
      <div className="dd-banner-glow" aria-hidden />
      <div className="dd-banner-left">
        <div className="dd-banner-icon" aria-hidden><Zap width={20} height={20} /></div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="c-strong fw-semi fs-sm">
              {inDd ? 'Equity Curve Below Peak' : 'Equity Curve at Peak Baseline'}
            </span>
            <span className={`dd-pill ${inDd ? 'dd-pill-rose' : 'dd-pill-emerald'}`}>
              {inDd ? `${ddPct.toFixed(2)}% UNDERWATER` : '0.00% PEAK'}
            </span>
          </div>
          <p className="dd-muted" style={{ marginTop: 2 }}>
            {inDd
              ? `Currently ${Math.abs(ddPct).toFixed(2)}% below the all-time high, `
                + `${trades} trade${trades === 1 ? '' : 's'} since that peak. Recovery is measured `
                + 'against the high-water mark, not the starting balance.'
              : 'Current drawdown is fully recovered. The next execution will either establish a new '
                + 'all-time high or begin a fresh drawdown episode.'}
          </p>
        </div>
      </div>
      <div className="dd-banner-meta">
        <span>
          {inDd ? 'Underwater for: ' : 'Longest drawdown: '}
          <strong className="c-strong fw-bold">
            {durTrades} trade{durTrades === 1 ? '' : 's'} / {durDays} day{durDays === 1 ? '' : 's'}
          </strong>
        </span>
      </div>
    </div>
  );
}
