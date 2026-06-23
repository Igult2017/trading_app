import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/lib/queryClient';
import { TrendingDown } from 'lucide-react';
import { useDelayedLoading } from '@/components/TradingLoader';
import { PanelSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { DiveProfile } from '@/components/drawdown/diveProfile';
import { DP_CSS } from '@/components/drawdown/dpStyles';

/**
 * DrawdownPanel — "Dive Profile" layout.
 * Wired 1-to-1 to /api/drawdown/compute (server/python/drawdown). Every section
 * is real data: KPIs, the underwater hero chart, the strategy/instrument
 * leaderboard split by BULLISH/BEARISH direction, edge/Monte-Carlo/recovery model,
 * pair×strategy heatmap, loss frequency, structural diagnostics, sessions, loss
 * streaks + timeline, R:R distribution and the monthly drawdown table.
 */

// ── helpers ─────────────────────────────────────────────────────────────────
function fmtDd(v?: number | null): string {
  if (v == null) return '—';
  if (v === 0) return '0.00%';
  return `${v.toFixed(2)}%`;
}

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtRange(start?: string | null, end?: string | null): string {
  if (!start) return '';
  try {
    const s = new Date(start);
    if (!end || end === start) return `${MONTH_ABBR[s.getMonth()]} ${s.getDate()}`;
    const e = new Date(end);
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear())
      return `${MONTH_ABBR[s.getMonth()]} ${s.getDate()}–${e.getDate()}`;
    return `${MONTH_ABBR[s.getMonth()]} ${s.getDate()} – ${MONTH_ABBR[e.getMonth()]} ${e.getDate()}`;
  } catch { return ''; }
}

function heatBg(avgDdPct: number): React.CSSProperties {
  const v = Math.abs(avgDdPct);
  if (!v) return { background: 'var(--raise)' };
  const a = Math.min(v / 1.4, 1) * 0.5 + 0.1;
  return { background: `rgba(242,89,106,${a.toFixed(3)})` };
}

function sevTone(avgDdPct: number): string {
  const abs = Math.abs(avgDdPct);
  if (abs < 1.0) return 'gain';
  if (abs < 2.5) return 'warn';
  return 'loss';
}
function toneVar(tone: string): string {
  return tone === 'loss' ? 'var(--loss)' : tone === 'warn' ? 'var(--warn)' : tone === 'gain' ? 'var(--gain)' : 'var(--ink2)';
}

function Rule({ label, sub, right }: { label: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="rule">
      <div className="lab">
        <span className="pin" />
        <span className="t">{label}</span>
        {sub && <span className="sub">{sub}</span>}
      </div>
      {right}
    </div>
  );
}
function Seg({ options, value, onChange, accents }: {
  options: string[]; value: string; onChange: (v: string) => void; accents?: Record<string, string>;
}) {
  return (
    <div className="seg">
      {options.map((o) => {
        const ac = accents && accents[o];
        return (
          <button key={o} className={value === o ? 'on' : ''} onClick={() => onChange(o)}
            style={value === o && ac ? { color: ac, borderBottomColor: ac } : undefined}>{o}</button>
        );
      })}
    </div>
  );
}

// ── component ───────────────────────────────────────────────────────────────
export default function DrawdownPanel({ sessionId }: { sessionId?: string | null }) {
  const [ddView, setDdView] = useState('STRATEGY');
  const [dir,    setDir]    = useState('BULLISH');
  const [freq,   setFreq]   = useState('SESSION');
  const [diag,   setDiag]   = useState('CONTEXT');

  const { data: result, isLoading, isError, error } = useQuery<any>({
    queryKey: ['/api/drawdown/compute', sessionId],
    enabled: !!sessionId,
    // Always pull fresh on open: treat cached data as stale and refetch every mount, so a
    // redeploy (or any recompute fix) shows up on the next visit with NO manual cache-bust.
    // keepPreviousData (global default) shows the cached result instantly while the fresh
    // one loads in the background, so there's no loading flash. The server still caches the
    // heavy Python compute for 5 min, so these refetches stay cheap.
    staleTime: 0,
    refetchOnMount: 'always',
    gcTime:   30 * 60 * 1000,
    retry: 2,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 4000),
    queryFn: async () => {
      const r = await authFetch(`/api/drawdown/compute?sessionId=${sessionId}`);
      if (!r.ok) throw new Error(`${r.status}: ${r.statusText}`);
      const json = await r.json();
      if (!json.success) throw new Error(json.error || 'Drawdown computation failed');
      return json;
    },
  });

  const d        = result ?? null;
  const ts       = d?.topStats;
  const intel    = d?.intelligence;
  const risk     = d?.riskModel;
  const mc       = d?.monteCarlo;
  const recovery = d?.recovery;

  // ── states ────────────────────────────────────────────────────────────────
  const showLoader = useDelayedLoading(!!sessionId && isLoading);
  if (showLoader) return <PanelSkeleton />;

  const centered = (icon: React.ReactNode, title: string, subtitle: string, titleColor = 'text-slate-500') => (
    <div className="dp"><style>{DP_CSS}</style>
      <div style={{ minHeight: 420, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        {icon}
        <p className={`${titleColor}`} style={{ fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--ink2)' }}>{title}</p>
        <p style={{ fontSize: 10, color: 'var(--ink3)' }}>{subtitle}</p>
      </div>
    </div>
  );

  if (!sessionId)
    return centered(<TrendingDown style={{ width: 30, height: 30, color: 'var(--ink3)' }} />, 'No session selected', 'Select or create a session to view drawdown analysis');
  if (isError)
    return centered(<TrendingDown style={{ width: 30, height: 30, color: 'var(--loss)' }} />, 'Failed to load drawdown data', (error as Error)?.message || 'Check server logs or try refreshing');
  if (!ts || !intel)
    return centered(<TrendingDown style={{ width: 30, height: 30, color: 'var(--ink3)' }} />, 'No drawdown data yet', 'Log trades in this session to populate the analysis');

  // ── derive ──────────────────────────────────────────────────────────────────
  const cur = intel.current ?? {};
  const uw  = intel.underwater ?? {};
  const inDd = !!cur.inDrawdown;

  const kpis = [
    { k: 'Max Drawdown',    v: fmtDd(ts.maxDrawdown), c: 'loss' },
    { k: 'Avg. Drawdown',   v: fmtDd(ts.avgDrawdown), c: 'warn' },
    { k: 'Recovery Factor', v: String(ts.recoveryFactor), c: 'gain' },
    { k: 'Trend Alignment', v: `${ts.trendAlignment}%`, c: '' },
  ];

  // Leaderboard — direction-filtered (BULLISH/BEARISH) × STRATEGY/INSTRUMENT.
  const dirKey  = dir === 'BEARISH' ? 'bearish' : 'bullish';
  const viewKey = ddView === 'INSTRUMENT' ? 'byInstrument' : 'byStrategy';
  const byDir   = intel.byDirection;
  const leaderRows: any[] = byDir
    ? (byDir[dirKey]?.[viewKey] ?? [])
    : ((ddView === 'INSTRUMENT' ? intel.byInstrument : intel.byStrategy) ?? []);
  const leaderMax = Math.max(0.01, ...leaderRows.map((r: any) => Math.abs(r.totalLossPct)));

  const edge = risk ? [
    { k: 'Win Rate', v: `${risk.winRate}%`, c: '' },
    { k: 'Payoff (avg win / loss)', v: `${risk.payoff}x`, c: '' },
    { k: 'Kelly Optimal Risk', v: `${risk.kellyPct}%`, c: 'gain' },
    { k: 'Loss Streak (actual / expected)', v: `${risk.actualMaxLossStreak} / ${risk.expectedMaxLossStreak}`, c: risk.streakWithinExpectation ? '' : 'loss' },
    ...(risk.mae?.hasData ? [{ k: 'Loser vs Winner MAE', v: `${risk.mae.ratio}x deeper`, c: 'warn' }] : []),
  ] : [];

  const hasMc = mc && mc.hasData;
  const monte = hasMc ? [
    { k: 'Expected Max DD', v: fmtDd(mc.expectedMaxDd), c: 'warn' },
    { k: 'Worst Case (95%)', v: fmtDd(mc.worstCase95), c: 'loss' },
    { k: 'Worst Case (99%)', v: fmtDd(mc.worstCase99), c: 'loss' },
    { k: 'Risk of Ruin (>50% DD)', v: `${mc.riskOfRuinPct}%`, c: mc.riskOfRuinPct > 1 ? 'loss' : 'gain' },
  ] : [];

  const recHas = recovery?.hasData;
  const recNote = recHas
    ? (recovery.verdict === 'increase' ? 'You trade LARGER when underwater — revenge-recovery risk.'
      : recovery.verdict === 'reduce' ? 'You reduce size when underwater — disciplined recovery.'
      : 'Your position sizing stays steady through drawdowns.')
    : 'Not enough underwater trades to assess recovery sizing.';
  const recColor = recovery?.verdict === 'increase' ? 'loss' : recovery?.verdict === 'reduce' ? 'gain' : '';

  const heatRows: any[]   = d.heatmap ?? [];
  const heatCols: string[] = heatRows[0]?.cells?.map((c: any) => c.strategy) ?? [];

  // Loss-frequency card: SESSION (loss contribution per trading session) or INSTRUMENT.
  // Replaces the old ATTR view that jumbled strategies + sessions + psychology together.
  // Both lead with raw loss contribution (XL / YT); the bar = the group's own loss rate.
  const freqList: any[] = (freq === 'SESSION'
    ? (d.sessions ?? []).map((s: any) => ({ name: s.session, losses: s.losses, total: s.total, lossRate: s.lossRate }))
        .sort((a: any, b: any) => b.losses - a.losses)
    : (d.frequency?.instr ?? []))
    .slice(0, 6);

  const structKey = diag === 'ENTRY' ? 'entry' : 'context';
  const structSections: any[] = d.structural?.[structKey] ?? [];

  const sessions: any[] = d.sessions ?? [];

  const sk = d.streaks;
  const timeline: string[] = (sk?.timeline ?? []).map((t: any) => t.result);

  const rrBuckets: any[] = d.rrBuckets ?? [];
  const rrTone = (label: string) =>
    label === '< 1:1' ? 'loss' : label === '1:1 – 1:2' ? 'warn' : label === '> 1:3' ? 'gain' : 'dim';
  const belowTarget = rrBuckets
    .filter((b: any) => b.label === '< 1:1' || b.label === '1:1 – 1:2')
    .reduce((s: number, b: any) => s + (b.pct || 0), 0);

  const monthly: any[] = d.monthly ?? [];
  const years: number[] = monthly.map((m: any) => m.year);
  const monthlyRange = years.length === 0 ? '' : years[0] === years[years.length - 1] ? `${years[0]}` : `${years[0]}–${years[years.length - 1]}`;

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="dp">
      <style>{DP_CSS}</style>
      <div className="shell">

        {/* ── HERO ── */}
        <section>
          <div className="hero-head">
            <div>
              <div className="eyebrow">Drawdown Tracking</div>
              <h1 className="hero-h1">Where Are You Losing?</h1>
            </div>
            <div className="equity">
              <span className="slabel">Status :</span>
              <span className="t" style={{ color: inDd ? 'var(--loss)' : 'var(--gain)' }}>
                {inDd ? `In Drawdown ${fmtDd(cur.ddPct)}` : 'At Equity Highs'}
              </span>
            </div>
          </div>

          <div className="kpis">
            {kpis.map((kp) => (
              <div className="kpi" key={kp.k}><div className="k">{kp.k}</div><div className={`v ${kp.c}`}>{kp.v}</div></div>
            ))}
          </div>

          <div className="chart-wrap">
            <DiveProfile series={intel.series ?? []} inDrawdown={inDd} currentDdPct={cur.ddPct ?? 0} />
          </div>

          <div className="chart-foot">
            <div className="foot"><div className="k">Since Peak</div><div className="v">{cur.tradesSincePeak ?? 0}<span className="u">trades{cur.daysSincePeak != null ? ` · ${cur.daysSincePeak}d` : ''}</span></div></div>
            <div className="foot"><div className="k">Longest Underwater</div><div className="v">{uw.longestTrades ?? 0}<span className="u">trades{uw.longestDays ? ` · ${uw.longestDays}d` : ''}</span></div></div>
            <div className="foot"><div className="k">Avg Recovery</div><div className="v">{uw.avgRecoveryTrades ?? 0}<span className="u">trades</span></div></div>
            <div className="foot" style={{ marginLeft: 'auto' }}><div className="k">Deepest</div><div className="v loss">{fmtDd(ts.maxDrawdown)}</div></div>
          </div>
        </section>

        {/* ── STRATEGY LEADERBOARD ── */}
        <section>
          <Rule label={`Drawdown by ${ddView === 'INSTRUMENT' ? 'Instrument' : 'Strategy'}`} right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
              <Seg options={['BEARISH', 'BULLISH']} value={dir} onChange={setDir} accents={{ BEARISH: 'var(--loss)', BULLISH: 'var(--gain)' }} />
              <span style={{ width: 1, height: 13, background: 'var(--line2)' }} />
              <Seg options={['STRATEGY', 'INSTRUMENT']} value={ddView} onChange={setDdView} />
            </div>
          } />
          <div className="colh"><span /><span /><span>Loss Contribution</span><span style={{ textAlign: 'right' }}>Drawdown</span></div>
          <div className="lead">
            {leaderRows.length === 0 ? (
              <div className="empty-row">No {dir.toLowerCase()} trades recorded</div>
            ) : leaderRows.map((s: any, i: number) => {
              const neg = s.totalLossPct < 0;
              const w = (Math.abs(s.totalLossPct) / leaderMax) * 100;
              return (
                <div className="lrow" key={s.name}>
                  <span className="lrank">{String(i + 1).padStart(2, '0')}</span>
                  <div className="lname"><span className="ltag">{s.name}</span><span className="lmeta">{s.trades} trades · {s.lossRate}% loss</span></div>
                  <div className="lbar"><i style={{ width: `${Math.max(w, 1)}%`, background: neg ? 'var(--loss)' : 'var(--ink3)' }} /></div>
                  <span className={`lval ${neg ? 'loss' : 'gain'}`}>{neg ? `${s.totalLossPct.toFixed(2)}%` : '0.00%'}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── MODEL TRIPLE ── */}
        <section>
          <Rule label="Edge & Risk Model" sub="Model · Projection · Recovery" />
          <div className="trip">
            <div>
              <div className="subh">Edge & Risk Model</div>
              <div className="dl">{edge.map((r) => <div className="r" key={r.k}><span className="k">{r.k}</span><span className={`v ${r.c}`}>{r.v}</span></div>)}</div>
            </div>
            <div>
              <div className="subh">Monte-Carlo Projection</div>
              {hasMc ? <>
                <div className="dl">{monte.map((r) => <div className="r" key={r.k}><span className="k">{r.k}</span><span className={`v ${r.c}`}>{r.v}</span></div>)}</div>
                <p className="note">{mc.actualPercentile}% of {mc.runs} simulated histories had a drawdown as deep or deeper than yours.</p>
              </> : <p className="note">Not enough trades to run a Monte-Carlo projection.</p>}
            </div>
            <div>
              <div className="subh">Recovery Pattern</div>
              <div className="dl"><div className="r"><span className="k">Size When Underwater</span><span className={`v ${recColor}`}>{recHas ? `${recovery.sizeRatio}x baseline` : '—'}</span></div></div>
              <p className="note">{recNote}</p>
            </div>
          </div>
        </section>

        {/* ── RISK SURFACE ── */}
        <section>
          <Rule label="Risk Heatmap · Pair vs Strategy" sub="Loss Intensity by Cell" />
          <div className="rs">
            {heatRows.length === 0 ? (
              <div className="empty-row">No heatmap data</div>
            ) : (
              <div className="heat" style={{ ['--cols' as any]: heatCols.length || 1 }}>
                <div className="hrow"><div className="hp">PAIR</div>{heatCols.map((c, i) => <div className="hh" key={i}>{c}</div>)}</div>
                {heatRows.map((r) => (
                  <div className="hrow" key={r.pair}>
                    <div className="hp">{r.pair}</div>
                    {r.cells.map((c: any, i: number) => (
                      <div className="hc" key={i} style={heatBg(c.avgDdPct)}>
                        <div className="p" style={{ color: c.avgDdPct < 0 ? 'var(--heat-neg-ink)' : 'var(--ink3)' }}>{c.avgDdPct === 0 ? '0.0%' : `${c.avgDdPct.toFixed(1)}%`}</div>
                        <div className="t">({c.total}T/{c.losses}L)</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <div className="freq">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
                <span className="subh" style={{ margin: 0 }}>Loss Frequency</span>
                <Seg options={['SESSION', 'INSTR']} value={freq} onChange={setFreq} />
              </div>
              {freqList.length === 0 ? <span className="mut" style={{ fontSize: 11 }}>No {freq === 'SESSION' ? 'session' : 'instrument'} data</span> : freqList.map((f, i) => {
                const tone = f.lossRate > 60 ? 'loss' : f.lossRate > 35 ? 'warn' : 'gain';
                return (
                  <div key={i}>
                    <div className="frow"><span className="dim" style={{ letterSpacing: '.06em' }}>{f.name}</span><span className={`num ${tone}`} style={{ fontSize: 12 }}>{f.losses}L / {f.total}T</span></div>
                    <div className="bar"><i style={{ width: `${Math.min(100, f.lossRate)}%`, background: toneVar(tone) }} /></div>
                    <div className="fsub">{f.lossRate}% loss rate</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── STRUCTURAL ── */}
        <section>
          <Rule label="Structural Diagnostics" right={<Seg options={['CONTEXT', 'ENTRY']} value={diag} onChange={setDiag} />} />
          <div className="struct-top">
            {structSections.length === 0 ? (
              <span className="mut" style={{ fontSize: 12 }}>No structural data yet</span>
            ) : structSections.map((sec, si) => (
              <div key={si} style={si > 0 ? { marginTop: 18 } : undefined}>
                <div className="subh" style={{ color: 'var(--loss)' }}>{sec.title}</div>
                {sec.items.map((it: any, ii: number) => (
                  <div className="rp" key={ii}>
                    <span className="nm">{it.label}</span>
                    <span style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                      <span className="v">{fmtDd(it.avgDdPct)}</span><span className="tl">{it.total}T/{it.losses}L</span>
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="sg">
            <div>
              <div className="subh">Session</div>
              {sessions.length === 0 ? <span className="mut" style={{ fontSize: 11 }}>No session data</span> : sessions.map((s) => {
                const tone = sevTone(s.avgDdPct);
                return (
                  <div className="sess" key={s.session}>
                    <div className="top"><span className="nm">{s.session}</span><span className={`vv ${tone}`}>{fmtDd(s.avgDdPct)}</span></div>
                    <div className="sb">N={s.total} · {s.losses} losses</div>
                    <div className="sbar"><i style={{ width: `${Math.round(s.barWidthPct)}%`, background: toneVar(tone) }} /></div>
                    <div className="wp"><span className="l">Worst Pair</span><span className="r">{s.worstPair} {fmtDd(s.worstDdPct)}</span></div>
                  </div>
                );
              })}
            </div>
            <div>
              <div className="subh">Loss Streaks</div>
              <div className="ls">
                <div><div className="k">Max Loss Streak</div><div className="big loss">{sk?.maxLossStreak?.length ?? 0}</div><div className="s">{fmtRange(sk?.maxLossStreak?.startDate, sk?.maxLossStreak?.endDate) || 'no data'}</div></div>
                <div><div className="k">Avg Loss Streak</div><div className="big warn">{sk?.avgLossStreak ?? 0}</div><div className="s">before recovery</div></div>
                <div><div className="k">Post-Streak Revenge</div><div className="big loss">{sk?.revengeRate ?? 0}%</div><div className="s">of streaks triggered</div></div>
                <div><div className="k">Best Win Streak</div><div className="big gain">{sk?.bestWinStreak?.length ?? 0}</div><div className="s">{fmtRange(sk?.bestWinStreak?.startDate, sk?.bestWinStreak?.endDate) || 'no data'}</div></div>
              </div>
              <div className="k" style={{ fontSize: 9, letterSpacing: '.13em', textTransform: 'uppercase', color: 'var(--ink3)', marginTop: 20 }}>Trade Timeline</div>
              <div className="tl">{timeline.length === 0 ? <span className="mut" style={{ fontSize: 10 }}>—</span> : timeline.map((c, i) => <span key={i} className={c === 'W' ? 'tw' : c === 'L' ? 'tlo' : 'tb'}>{c}</span>)}</div>
            </div>
            <div>
              <div className="subh">RR Distribution</div>
              {rrBuckets.length === 0 ? <span className="mut" style={{ fontSize: 11 }}>No RR data</span> : <>
                {rrBuckets.map((b) => {
                  const tone = rrTone(b.label);
                  return (
                    <div className="rr" key={b.label}>
                      <div className="top">
                        <span style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}><span className={`rng ${tone}`}>{b.label}</span><span className="nm">{b.note}</span></span>
                        <span style={{ display: 'flex', gap: 9, alignItems: 'baseline' }}><span className="ct">{b.count}T</span><span className="pc">{b.pct}%</span></span>
                      </div>
                      <div className="rrbar"><i style={{ width: `${b.pct}%`, background: toneVar(tone) }} /></div>
                    </div>
                  );
                })}
                {belowTarget > 0 && <p className="note">{belowTarget.toFixed(0)}% of trades fall below target RR — <span className="loss">primary drawdown driver</span></p>}
              </>}
            </div>
          </div>
        </section>

        {/* ── MONTHLY TABLE ── */}
        {monthly.length > 0 && (
          <section>
            <Rule label={`Monthly Drawdown${monthlyRange ? ` · ${monthlyRange}` : ''}`} sub="Dominant Cause per Month" />
            <div className="mwrap">
              <table className="mtbl">
                <thead><tr><th>Month</th><th>Return</th><th>Rec.</th><th>Max DD</th><th>Big L</th><th>Loss</th><th>CF</th></tr></thead>
                <tbody>
                  {monthly.map((m, i) => {
                    // CF (carry-forward) = the PREVIOUS month's return, but only if it ended
                    // RED. A red month carries its loss into this month (prev -4% → this month
                    // starts -4% in the hole, so a +14% month nets +10%). A green previous
                    // month carries nothing (it already ended positive), and the first month
                    // has nothing before it.
                    const prevRet = i > 0 ? (monthly[i - 1].equityGrowthPct ?? 0) : 0;
                    const cf = prevRet < 0 ? `${prevRet.toFixed(2)}%` : '0.00%';
                    const eq = m.equityGrowthPct;
                    const eqStr = eq == null ? '—' : eq === 0 ? '0.00%' : `${eq > 0 ? '+' : ''}${eq.toFixed(2)}%`;
                    const eqCls = eq == null ? 'mut' : eq > 0 ? 'gain' : eq < 0 ? 'loss' : 'dim';
                    const dot = m.dominantCauseClass === 'bad' ? 'var(--loss)' : m.dominantCauseClass === 'good' ? 'var(--gain)' : 'var(--warn)';
                    return (
                      <tr key={`${m.month}-${m.year}`}>
                        <td><span className="mmname"><span className="d" style={{ background: dot, boxShadow: m.dominantCauseClass === 'good' ? undefined : 'none' }} /><span className="nm">{m.month.toUpperCase()}/{m.year}</span></span></td>
                        <td className={eqCls}>{eqStr}</td>
                        <td className="mut">{Math.round(m.recoveryPct)}%</td>
                        <td className={m.maxDdPct === 0 ? 'mut' : 'loss'}>{fmtDd(m.maxDdPct)}</td>
                        <td className={m.biggestLossPct === 0 ? 'mut' : 'loss'}>{fmtDd(m.biggestLossPct)}</td>
                        <td className="dim">{m.lossCount}/{m.totalTrades}</td>
                        <td className={cf === '0.00%' ? 'mut' : 'loss'}>{cf}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
