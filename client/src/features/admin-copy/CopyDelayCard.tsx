import { Timer } from 'lucide-react';
import { C, FONT } from '@/components/admin-ui/tokens';
import { Panel } from '@/components/admin-ui/AdminUI';
import { useAdminData } from '@/features/admin-data/useAdminData';

/**
 * HOW FAST A COPY REACHES THE FOLLOWER (21 Nov 2026, docs/copy-realtime-plan.md step 9). The delay is cTrader's own
 * time on the follower's confirming event minus its time on the master's, so neither our server's clock nor the
 * network distorts it. Today's middle (median) and worst, and the last 20 copies.
 */
type Row = { created_at: string; event_type: string; delay_ms: number; account: string | null; login_id: string | null };
type Delay = { today: { copies: number; median_ms: number | null; worst_ms: number | null }; recent: Row[] };

const secs = (ms: number | null) => (ms == null ? '—' : `${(ms / 1000).toFixed(2)} s`);

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120 }}>
      <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 500, color: C.muted }}>{label}</span>
      <span style={{ fontFamily: FONT, fontSize: 24, fontWeight: 700, color: C.text }}>{value}</span>
    </div>
  );
}

export default function CopyDelayCard() {
  const { data, loading, error } = useAdminData<Delay | null>('/api/admin/copy/delay', { fallback: null });

  if (loading) {
    return (
      <Panel title="Copy speed">
        <p style={{ margin: 0, padding: '16px 24px', fontFamily: FONT, fontSize: 14, color: C.muted }}>Loading…</p>
      </Panel>
    );
  }
  if (error || !data) {
    return (
      <Panel title="Copy speed">
        <p role="alert" style={{ margin: 0, padding: '16px 24px', fontFamily: FONT, fontSize: 14, color: C.red }}>
          Could not read the copy delays ({error ?? 'no reply'}). Refresh to try again.
        </p>
      </Panel>
    );
  }
  const { today, recent } = data;
  return (
    <Panel title="Copy speed" hint="Master's action to the follower's confirmation, by cTrader's own clock">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, padding: '16px 24px' }}>
        <Stat label="Copies today" value={String(today.copies ?? 0)} />
        <Stat label="Typical today (median)" value={secs(today.median_ms)} />
        <Stat label="Slowest today" value={secs(today.worst_ms)} />
      </div>
      {recent.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px 24px', color: C.muted,
                      fontFamily: FONT, fontSize: 14 }}>
          <Timer size={18} aria-hidden="true" /> No copy has been timed yet — the next copied trade appears here.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', padding: '0 24px 16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT, fontSize: 14, color: C.text }}>
            <caption style={{ textAlign: 'left', fontSize: 12, color: C.muted, padding: '0 0 8px' }}>Last 20 copies</caption>
            <thead>
              <tr style={{ textAlign: 'left', color: C.muted, fontSize: 12 }}>
                <th scope="col" style={{ padding: '8px 8px 8px 0', fontWeight: 500 }}>When (UTC)</th>
                <th scope="col" style={{ padding: 8, fontWeight: 500 }}>Account</th>
                <th scope="col" style={{ padding: 8, fontWeight: 500 }}>Action</th>
                <th scope="col" style={{ padding: 8, fontWeight: 500, textAlign: 'right' }}>Delay</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r, i) => (
                <tr key={`${r.created_at}-${i}`} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: '8px 8px 8px 0' }}>{new Date(r.created_at).toISOString().slice(0, 19).replace('T', ' ')}</td>
                  <td style={{ padding: 8 }}>{r.account ?? 'account'} · {r.login_id ?? '?'}</td>
                  <td style={{ padding: 8 }}>{r.event_type}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontWeight: 500 }}>{secs(r.delay_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
