import React from 'react';
import { Target, RefreshCw, Shield, Info, AlertTriangle } from 'lucide-react';

/**
 * ddRiskCards — the three-card row from his 2026-11-03 mock-up: Edge & Risk Model, Monte-Carlo
 * Projection, Recovery Pattern.
 *
 * Straight off `riskModel`, `monteCarlo` and `recovery` (server/python/drawdown/risk_model.py,
 * montecarlo.py, recovery.py). Two of those three report `hasData`, and both are honoured: a session
 * with too few trades says so instead of printing a confident zero.
 *
 * ⚠ THE MOCK-UP'S RECOVERY CARD ASSERTS "Behavioral Risk Detected" OUTRIGHT. That is only true for
 * one of three verdicts the API can return (`increase` / `reduce` / steady). Printing the warning
 * unconditionally would tell someone who *reduces* size under pressure that they have a revenge-
 * trading problem, so the card follows `recovery.verdict` and the red warning box appears only for
 * `increase`.
 */
function fmtDd(v?: number | null): string {
  if (v == null) return '—';
  return v === 0 ? '0.00%' : `${Number(v).toFixed(2)}%`;
}

function Row({ label, sub, value, cls }: { label: string; sub?: string; value: string; cls?: string }) {
  return (
    <div className="dd-inner">
      <div>
        <span className="fs-xs c-dim" style={{ display: 'block' }}>{label}</span>
        {sub && <span className="fs-10 c-faint" style={{ fontFamily: 'var(--dd-sans)' }}>{sub}</span>}
      </div>
      <span className={`fs-base fw-bold dd-serif ${cls ?? 'c-strong'}`}>{value}</span>
    </div>
  );
}

function MiniRow({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="dd-inner-sm dd-between">
      <span className="c-dim">{label}</span>
      <span className={`fw-bold ${cls ?? 'c-strong'}`}>{value}</span>
    </div>
  );
}

export function DdRiskCards({ risk, mc, recovery }: { risk: any; mc: any; recovery: any }) {
  const kelly = Number(risk?.kellyPct ?? 0);
  const actual = Number(risk?.actualMaxLossStreak ?? 0);
  const expected = Number(risk?.expectedMaxLossStreak ?? 0);
  const withinExp = risk?.streakWithinExpectation !== false;

  const hasMc = !!mc?.hasData;
  const ruin = Number(mc?.riskOfRuinPct ?? 0);

  const recHas = !!recovery?.hasData;
  const ratio = Number(recovery?.sizeRatio ?? 0);
  const verdict = recovery?.verdict;
  const risky = recHas && verdict === 'increase';
  // ⚠ "TOO FEW TRADES TO CALL IT A PATTERN" IS ITS OWN STATE, not a kind of warning. `recovery.py`
  // returns `insufficient` below its MIN_UNDERWATER floor: the ratio is real and still shown, but no
  // behavioural claim is made from it. This card previously printed a red "Behavioural Risk
  // Detected" box off a SINGLE underwater trade (his screen, 2026-11-03).
  const thin = recHas && verdict === 'insufficient';
  const uwCount = Number(recovery?.underwaterCount ?? 0);

  return (
    <section className="dd-grid dd-g3">
      {/* ── EDGE & RISK MODEL ── */}
      <div className="dd-card dd-colbetween" style={{ gap: 16 }}>
        <div>
          <div className="dd-between" style={{ marginBottom: 12 }}>
            <h3 className="dd-title">Edge &amp; Risk Model</h3>
            <span className="dd-ico-badge ico-amber" aria-hidden><Target width={16} height={16} /></span>
          </div>
          <div className="dd-mono" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Row label="Win Rate" value={`${risk?.winRate ?? 0}%`} cls="c-emerald" />
            <Row label="Payoff Ratio" sub="Avg Win / Avg Loss" value={`${risk?.payoff ?? 0}x`}
                 cls={Number(risk?.payoff ?? 0) >= 1 ? 'c-emerald' : 'c-rose'} />
            <Row label="Kelly Optimal Risk" sub="Full Kelly sizing model" value={`${kelly}%`} cls="c-amber" />
            <Row label="Loss Streak" sub="Actual vs Expected" value={`${actual} / ${expected}`}
                 cls={withinExp ? 'c-strong' : 'c-rose'} />
            {/* Only when the API actually measured it — the old panel showed this and dropping it
                would have lost a real figure that the mock-up simply had no row for. */}
            {risk?.mae?.hasData && (
              <Row label="Loser vs Winner MAE" sub="How much deeper losers ran"
                   value={`${risk.mae.ratio}x deeper`} cls="c-amber" />
            )}
          </div>
        </div>
        <div className="dd-note">
          <Info width={14} height={14} style={{ color: 'var(--amber)', flexShrink: 0 }} aria-hidden />
          <span>
            {kelly > 0
              ? 'Kelly is a ceiling, not a target — sizing below it protects the capital buffer.'
              : 'Not enough closed trades to model an optimal risk fraction yet.'}
          </span>
        </div>
      </div>

      {/* ── MONTE-CARLO ── */}
      <div className="dd-card dd-colbetween" style={{ gap: 12 }}>
        <div>
          <div className="dd-between" style={{ marginBottom: 12, gap: 8 }}>
            <div>
              <h3 className="dd-title">Monte-Carlo Projection</h3>
              <p className="dd-muted">
                {hasMc ? `${Number(mc.runs).toLocaleString()} simulated trading sequences` : 'Not yet available'}
              </p>
            </div>
            <span className="dd-ico-badge ico-blue" aria-hidden><RefreshCw width={16} height={16} /></span>
          </div>
          {hasMc ? (
            <div className="dd-mono fs-xs" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <MiniRow label="Expected Max DD:" value={fmtDd(mc.expectedMaxDd)} cls="c-amber" />
              <MiniRow label="Worst Case (95% Conf.):" value={fmtDd(mc.worstCase95)} cls="c-rose" />
              <MiniRow label="Worst Case (99% Conf.):" value={fmtDd(mc.worstCase99)} cls="c-rose-mid" />
              <MiniRow label={`Risk of Ruin (>${Math.abs(Number(mc.ruinThreshold ?? 50))}% DD):`}
                       value={`${ruin}%`} cls={ruin > 1 ? 'c-rose' : 'c-emerald'} />
            </div>
          ) : (
            <p className="dd-muted">Not enough trades to run a Monte-Carlo projection.</p>
          )}
        </div>
        {hasMc && (
          <div className="dd-insight">
            <Info width={16} height={16} style={{ color: 'var(--blue)', flexShrink: 0, marginTop: 2 }} aria-hidden />
            <p>
              <strong className="c-strong">{mc.actualPercentile}%</strong> of {Number(mc.runs).toLocaleString()}{' '}
              simulated histories had a drawdown as deep or deeper than yours ({fmtDd(mc.actualMaxDd)}).
            </p>
          </div>
        )}
      </div>

      {/* ── RECOVERY PATTERN ── */}
      <div className="dd-card dd-colbetween" style={{ gap: 12 }}>
        <div>
          <div className="dd-between" style={{ marginBottom: 12 }}>
            <h3 className="dd-title">Recovery Pattern</h3>
            <span className="dd-ico-badge ico-amber" aria-hidden><Shield width={16} height={16} /></span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="dd-inner-sm" style={{ display: 'block', padding: 14 }}>
              <div className="fs-xs c-dim" style={{ marginBottom: 4 }}>Position Size When Underwater</div>
              {/* Neutral ink while the sample is thin — a red figure is itself a claim. */}
              <div className={`fs-2xl fw-bold dd-serif ${
                thin ? 'c-ink' : risky ? 'c-rose' : recHas ? 'c-emerald' : 'c-dim'}`}>
                {recHas ? `${ratio}x ` : '— '}
                <span className="fs-xs c-dim" style={{ fontFamily: 'var(--dd-sans)', fontWeight: 400 }}>
                  baseline risk
                </span>
              </div>
            </div>
            {thin ? (
              <p className="dd-muted" style={{ lineHeight: 1.6 }}>
                Based on {uwCount} underwater trade{uwCount === 1 ? '' : 's'} — too few to call this a
                pattern. The ratio is real, but one or two trades cannot tell a habit from a one-off.
                It will be judged at {recovery?.minSample ?? 4}.
              </p>
            ) : risky ? (
              <div className="dd-warn">
                <div className="dd-warn-head">
                  <AlertTriangle width={16} height={16} style={{ flexShrink: 0 }} aria-hidden />
                  <span>Behavioural Risk Detected</span>
                </div>
                <p className="fs-xs c-soft" style={{ lineHeight: 1.6 }}>
                  You trade <strong className="c-amber-soft">LARGER ({ratio}x)</strong> when underwater —
                  elevated revenge-recovery risk across {recovery.underwaterCount} underwater trade
                  {recovery.underwaterCount === 1 ? '' : 's'}.
                </p>
              </div>
            ) : (
              <p className="dd-muted">
                {!recHas ? 'Not enough underwater trades to assess recovery sizing.'
                  : verdict === 'reduce' ? 'You reduce size when underwater — disciplined recovery.'
                  : 'Your position sizing stays steady through drawdowns.'}
              </p>
            )}
          </div>
        </div>
        <div className="dd-note">
          <span>{risky
            ? 'Recommendation: cap position size at 1.0x baseline while underwater.'
            : 'Measured against your baseline size outside drawdown.'}</span>
        </div>
      </div>
    </section>
  );
}
