import { Bot, CheckCircle2, CircleSlash, Send, Undo2 } from 'lucide-react';
import { C, FONT } from '@/components/admin-ui/tokens';
import { Panel, Pill, StatCard } from '@/components/admin-ui/AdminUI';
import { useAdminData } from '@/features/admin-data/useAdminData';
import { StatsAndTableSkeleton } from '@/features/admin-data/AdminSkeleton';
import { buildRows, price, summarise, when, type AutotradeFeed } from './autotradeRows';

/**
 * AUTOTRADE: every order the auto-trader sent, and every signal it did not act on, with the reason.
 *
 * His question, 2026-09-15: "Is autotrader even taking trades anymore? I havent seen any trade recorded
 * in the journal." The answer was in the broker's own order history and nowhere on the platform: a
 * refusal existed only as a Telegram DM. This screen is where that question is answered now.
 */
export const AUTOTRADE_URL = '/api/admin/autotrade?days=14';

const EMPTY: AutotradeFeed = { days: 14, orders: [], decisions: [] };
const HEADINGS = ['When', 'Pair', 'Side', 'Outcome', 'Entry · Stop · Target', 'Lots', 'Detail'];

const th: React.CSSProperties = {
  textAlign: 'left', padding: '12px 16px', fontFamily: FONT, fontSize: 13, fontWeight: 600,
  color: C.muted, background: C.thead, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '12px 16px', fontFamily: FONT, fontSize: 14, color: C.text,
  borderTop: `1px solid ${C.border}`, verticalAlign: 'top',
};

export default function AutotradeSection({ bp }: { bp: { isMobile: boolean; isTablet: boolean } }) {
  const { data, loading, error } = useAdminData<AutotradeFeed>(AUTOTRADE_URL, { fallback: EMPTY });
  if (loading) return <StatsAndTableSkeleton stats={4} rows={6} cols={7} />;

  const feed = data ?? EMPTY;
  const rows = buildRows(feed);
  const total = summarise(feed);
  const statCols = bp.isMobile || bp.isTablet ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: statCols, gap: 18 }}>
        <StatCard title="Orders sent" value={String(total.sent)} caption={`Last ${feed.days} days`} icon={Send} />
        <StatCard title="Filled" value={String(total.filled)} caption="Became a trade" icon={CheckCircle2} tone="good" />
        <StatCard title="Withdrawn" value={String(total.withdrawn)} caption="Setup died before entry" icon={Undo2} tone="blue" />
        <StatCard title="Not placed" value={String(total.notPlaced)} caption="Refused, broker refused or failed" icon={CircleSlash} tone="violet" />
      </div>

      <Panel
        title="Orders and decisions"
        hint="Newest first, in your local time. Refusals are recorded from 15 Sep 2026; earlier ones are only in your Telegram DMs."
      >
        {error ? (
          <p style={{ margin: 0, padding: '20px 22px', fontFamily: FONT, fontSize: 14, color: C.red }}>
            Could not load the auto-trader's orders ({error}). Refresh the page to try again.
          </p>
        ) : rows.length === 0 ? (
          <div style={{ padding: '40px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: C.accentSoft, color: C.indigo, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={22} />
            </div>
            <p style={{ margin: 0, fontFamily: FONT, fontSize: 15, fontWeight: 600, color: C.text }}>
              No orders or decisions in the last {feed.days} days
            </p>
            <p style={{ margin: 0, fontFamily: FONT, fontSize: 13, color: C.muted, maxWidth: 420 }}>
              Every signal the auto-trader handles will appear here, whether it placed an order or not.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 880, borderCollapse: 'collapse' }}>
              <thead>
                <tr>{HEADINGS.map(h => <th key={h} style={th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.key}>
                    <td style={{ ...td, whiteSpace: 'nowrap', color: C.muted }}>{when(r.when)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 600 }}>{r.symbol}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{r.side ?? '—'}</td>
                    <td style={td}><Pill tone={r.tone}>{r.outcome}</Pill></td>
                    <td style={{ ...td, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {price(r.symbol, r.entry)} · {price(r.symbol, r.stop)} · {price(r.symbol, r.target)}
                    </td>
                    <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{r.lots ?? '—'}</td>
                    <td style={{ ...td, color: C.muted, minWidth: 260 }}>{r.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
