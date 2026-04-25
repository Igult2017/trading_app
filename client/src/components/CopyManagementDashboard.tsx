import { useEffect, useState, useCallback } from 'react';
import {
  Radio, Users, Trash2, Settings as SettingsIcon, RefreshCw, ChevronDown,
  ChevronUp, X, AlertTriangle, ShieldCheck, UserMinus,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

type Master = {
  id: string;
  userId: string;
  accountId: string | null;
  sourceType: string;
  strategyName: string | null;
  description: string | null;
  tradingStyle: string | null;
  primaryMarket: string | null;
  isPublic: boolean;
  requireApproval: boolean;
  showOpenTrades: boolean;
  isActive: boolean;
  createdAt: string;
};

type Follower = {
  id: string;
  userId: string;
  accountId: string | null;
  masterId: string | null;
  lotMode: string;
  lotMultiplier: string | null;
  fixedLot: string | null;
  riskPercent: string | null;
  direction: string;
  maxOpenTrades: number | null;
  isActive: boolean;
  createdAt: string;
};

type Account = {
  id: string;
  nickname: string;
  platform: string;
  brokerServer: string | null;
  loginId: string;
};

const tone = {
  bg:        '#020203',
  panel:     '#05060a',
  border:    'rgba(255,255,255,0.06)',
  borderHi:  'rgba(255,255,255,0.12)',
  text:      '#e2e8f0',
  muted:     '#64748b',
  dim:       '#475569',
  blue:      '#60a5fa',
  green:     '#4ade80',
  red:       '#f87171',
  amber:     '#fbbf24',
  violet:    '#a78bfa',
};

// ─── Utility components ──────────────────────────────────────────────────────
function Btn({
  children, onClick, variant = 'ghost', danger, disabled, size = 'sm',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'ghost' | 'solid';
  danger?: boolean;
  disabled?: boolean;
  size?: 'xs' | 'sm';
}) {
  const palette = danger
    ? { bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.3)', text: tone.red, hoverBg: 'rgba(248,113,113,0.18)' }
    : { bg: 'rgba(96,165,250,0.06)',  border: 'rgba(96,165,250,0.2)',  text: tone.blue, hoverBg: 'rgba(96,165,250,0.14)' };

  const padding = size === 'xs' ? '4px 8px' : '6px 12px';
  const fontSize = size === 'xs' ? 9 : 10;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background:    variant === 'solid' ? palette.bg : 'transparent',
        border:        `1px solid ${palette.border}`,
        color:         disabled ? tone.dim : palette.text,
        padding,
        fontSize,
        fontFamily:    "'JetBrains Mono', monospace",
        fontWeight:    700,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        cursor:        disabled ? 'not-allowed' : 'pointer',
        opacity:       disabled ? 0.5 : 1,
        transition:    'all 0.15s',
        display:       'inline-flex',
        alignItems:    'center',
        gap:           6,
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.background = palette.hoverBg; }}
      onMouseLeave={e => { if (!disabled) (e.currentTarget as HTMLElement).style.background = variant === 'solid' ? palette.bg : 'transparent'; }}
    >
      {children}
    </button>
  );
}

function Toggle({ on, onChange, label, sub }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${tone.border}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: tone.text, fontSize: 12, fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ color: tone.dim, fontSize: 10, marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>{sub}</div>}
      </div>
      <button
        onClick={() => onChange(!on)}
        style={{
          width: 36, height: 20, borderRadius: 10,
          background: on ? tone.green : 'rgba(255,255,255,0.06)',
          border: `1px solid ${on ? tone.green : tone.borderHi}`,
          position: 'relative', cursor: 'pointer', transition: 'all 0.2s',
          flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: on ? 17 : 2,
          width: 14, height: 14, borderRadius: '50%',
          background: on ? '#020203' : '#94a3b8',
          transition: 'left 0.2s',
        }}/>
      </button>
    </div>
  );
}

function Select({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: { v: string; l: string }[]; label: string }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: `1px solid ${tone.border}` }}>
      <div style={{ color: tone.muted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 6 }}>{label}</div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%',
          background: tone.bg,
          border: `1px solid ${tone.borderHi}`,
          color: tone.text,
          fontSize: 12,
          padding: '8px 10px',
          fontFamily: "'JetBrains Mono', monospace",
          outline: 'none',
        }}
      >
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

function NumberField({ value, onChange, label, suffix, step = 0.1 }: { value: string; onChange: (v: string) => void; label: string; suffix?: string; step?: number }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: `1px solid ${tone.border}` }}>
      <div style={{ color: tone.muted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 6 }}>
        {label}{suffix && <span style={{ color: tone.dim, marginLeft: 4 }}>({suffix})</span>}
      </div>
      <input
        type="number"
        step={step}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', background: tone.bg, border: `1px solid ${tone.borderHi}`,
          color: tone.text, fontSize: 12, padding: '8px 10px',
          fontFamily: "'JetBrains Mono', monospace", outline: 'none',
        }}
      />
    </div>
  );
}

function ConfirmDialog({ title, message, confirmText, onConfirm, onCancel, danger }: {
  title: string; message: string; confirmText: string; onConfirm: () => void; onCancel: () => void; danger?: boolean;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
         onClick={onCancel}>
      <div style={{ background: tone.panel, border: `1px solid ${tone.borderHi}`, padding: 24, maxWidth: 400, width: '100%' }}
           onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <AlertTriangle size={18} style={{ color: danger ? tone.red : tone.amber }} />
          <h3 style={{ color: tone.text, fontSize: 14, margin: 0, fontWeight: 600 }}>{title}</h3>
        </div>
        <p style={{ color: tone.muted, fontSize: 12, lineHeight: 1.6, marginBottom: 18 }}>{message}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn onClick={onCancel}>Cancel</Btn>
          <Btn onClick={onConfirm} danger={danger} variant="solid">{confirmText}</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Provider Tab ────────────────────────────────────────────────────────────
function ProviderTab({ userId }: { userId: string }) {
  const [masters, setMasters]   = useState<Master[]>([]);
  const [accounts, setAccounts] = useState<Record<string, Account>>({});
  const [followers, setFollowers] = useState<Record<string, Follower[]>>({});
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Master | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ms: Master[] = await fetch(`/api/copy/masters?userId=${encodeURIComponent(userId)}`).then(r => r.ok ? r.json() : []);
      setMasters(Array.isArray(ms) ? ms : []);

      const accountIds = Array.from(new Set(ms.map(m => m.accountId).filter(Boolean))) as string[];
      const acctEntries = await Promise.all(accountIds.map(async id => {
        const a = await fetch(`/api/copy/accounts/${id}`).then(r => r.ok ? r.json() : null);
        return [id, a] as const;
      }));
      const acctMap: Record<string, Account> = {};
      for (const [id, a] of acctEntries) if (a) acctMap[id] = a;
      setAccounts(acctMap);

      const followerEntries = await Promise.all(ms.map(async m => {
        const f: Follower[] = await fetch(`/api/copy/followers?masterId=${m.id}`).then(r => r.ok ? r.json() : []);
        return [m.id, Array.isArray(f) ? f : []] as const;
      }));
      const fMap: Record<string, Follower[]> = {};
      for (const [id, list] of followerEntries) fMap[id] = list;
      setFollowers(fMap);
    } catch {
      setMasters([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const updateMaster = async (id: string, patch: Partial<Master>) => {
    setMasters(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
    try {
      await fetch(`/api/copy/masters/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch {
      load();
    }
  };

  const deleteMaster = async (m: Master) => {
    setConfirmDelete(null);
    try {
      await fetch(`/api/copy/masters/${m.id}`, { method: 'DELETE' });
      if (m.accountId) await fetch(`/api/copy/accounts/${m.accountId}`, { method: 'DELETE' });
      load();
    } catch {
      load();
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: tone.dim, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>Loading providers…</div>;
  }

  if (masters.length === 0) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center' }}>
        <Radio size={28} style={{ color: tone.dim, margin: '0 auto 12px' }} />
        <div style={{ color: tone.muted, fontSize: 13, fontWeight: 500, marginBottom: 6 }}>No provider accounts yet</div>
        <div style={{ color: tone.dim, fontSize: 11 }}>Use the wizard to register as a Signal Provider.</div>
      </div>
    );
  }

  return (
    <div>
      {confirmDelete && (
        <ConfirmDialog
          title="Delete this provider account?"
          message={`This permanently removes "${confirmDelete.strategyName || 'Untitled'}", its broker connection, and all ${followers[confirmDelete.id]?.length || 0} active follower link(s). This cannot be undone.`}
          confirmText="Delete Permanently"
          onConfirm={() => deleteMaster(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
          danger
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: tone.border }}>
        {masters.map(m => {
          const acct = m.accountId ? accounts[m.accountId] : null;
          const followerList = followers[m.id] || [];
          const isOpen = expanded === m.id;

          return (
            <div key={m.id} style={{ background: tone.panel }}>
              {/* Header row */}
              <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ color: tone.text, fontSize: 14, fontWeight: 600 }}>{m.strategyName || 'Untitled Strategy'}</span>
                    <span style={{
                      fontSize: 8, padding: '2px 6px', fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em',
                      background: m.isActive ? 'rgba(74,222,128,0.1)' : 'rgba(100,116,139,0.1)',
                      border: `1px solid ${m.isActive ? 'rgba(74,222,128,0.3)' : 'rgba(100,116,139,0.3)'}`,
                      color: m.isActive ? tone.green : tone.muted,
                    }}>{m.isActive ? '● Live' : '○ Paused'}</span>
                    <span style={{
                      fontSize: 8, padding: '2px 6px', fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em',
                      background: m.isPublic ? 'rgba(167,139,250,0.1)' : 'rgba(100,116,139,0.1)',
                      border: `1px solid ${m.isPublic ? 'rgba(167,139,250,0.3)' : 'rgba(100,116,139,0.3)'}`,
                      color: m.isPublic ? tone.violet : tone.muted,
                    }}>{m.isPublic ? 'Public' : 'Private'}</span>
                  </div>
                  <div style={{ color: tone.dim, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                    {acct ? `${acct.platform} · ${acct.loginId} · ${acct.brokerServer || 'no broker'}` : `${m.sourceType.toUpperCase()} source`}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: tone.muted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Users size={12} /> {followerList.length}
                  </span>
                  <Btn size="xs" onClick={() => setExpanded(isOpen ? null : m.id)}>
                    {isOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {isOpen ? 'Close' : 'Manage'}
                  </Btn>
                  <Btn size="xs" danger onClick={() => setConfirmDelete(m)}>
                    <Trash2 size={11} /> Delete
                  </Btn>
                </div>
              </div>

              {/* Expanded settings */}
              {isOpen && (
                <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${tone.border}` }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, marginTop: 16 }}>
                    {/* Settings */}
                    <div>
                      <div style={{ color: tone.muted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <SettingsIcon size={11} /> Provider Settings
                      </div>
                      <Toggle on={m.isActive}
                              onChange={v => updateMaster(m.id, { isActive: v })}
                              label="Broadcasting Active"
                              sub="Pause to stop publishing signals" />
                      <Toggle on={m.isPublic}
                              onChange={v => updateMaster(m.id, { isPublic: v })}
                              label="Listed publicly"
                              sub="Visible in the provider directory" />
                      <Toggle on={m.requireApproval}
                              onChange={v => updateMaster(m.id, { requireApproval: v })}
                              label="Require my approval"
                              sub="Manually approve every new follower" />
                      <Toggle on={m.showOpenTrades}
                              onChange={v => updateMaster(m.id, { showOpenTrades: v })}
                              label="Show open trades to followers"
                              sub="Live position visibility" />
                    </div>

                    {/* Followers */}
                    <div>
                      <div style={{ color: tone.muted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Users size={11} /> Followers ({followerList.length})
                      </div>
                      {followerList.length === 0 ? (
                        <div style={{ padding: '20px 0', color: tone.dim, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center' }}>
                          No followers yet
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: tone.border }}>
                          {followerList.map(f => (
                            <div key={f.id} style={{ background: tone.bg, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                              <div>
                                <div style={{ color: tone.text, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                                  Follower {f.id.slice(0, 8)}…
                                </div>
                                <div style={{ color: tone.dim, fontSize: 9, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
                                  {f.lotMode} · {f.lotMode === 'mult' ? `${f.lotMultiplier}×` : f.lotMode === 'fixed' ? `${f.fixedLot} lot` : `${f.riskPercent}% risk`}
                                </div>
                              </div>
                              <span style={{
                                fontSize: 8, padding: '2px 6px', fontFamily: "'JetBrains Mono', monospace",
                                fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em',
                                background: f.isActive ? 'rgba(74,222,128,0.1)' : 'rgba(251,191,36,0.1)',
                                border: `1px solid ${f.isActive ? 'rgba(74,222,128,0.3)' : 'rgba(251,191,36,0.3)'}`,
                                color: f.isActive ? tone.green : tone.amber,
                              }}>{f.isActive ? 'Active' : 'Pending'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Follower Tab ────────────────────────────────────────────────────────────
function FollowerTab({ userId }: { userId: string }) {
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [masters, setMasters]     = useState<Record<string, Master>>({});
  const [accounts, setAccounts]   = useState<Record<string, Account>>({});
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [confirmUnfollow, setConfirmUnfollow] = useState<Follower | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fs: Follower[] = await fetch(`/api/copy/followers?userId=${encodeURIComponent(userId)}`).then(r => r.ok ? r.json() : []);
      setFollowers(Array.isArray(fs) ? fs : []);

      const masterIds  = Array.from(new Set(fs.map(f => f.masterId).filter(Boolean))) as string[];
      const accountIds = Array.from(new Set(fs.map(f => f.accountId).filter(Boolean))) as string[];

      const [mEntries, aEntries] = await Promise.all([
        Promise.all(masterIds.map(async id => {
          const m = await fetch(`/api/copy/masters/${id}`).then(r => r.ok ? r.json() : null);
          return [id, m] as const;
        })),
        Promise.all(accountIds.map(async id => {
          const a = await fetch(`/api/copy/accounts/${id}`).then(r => r.ok ? r.json() : null);
          return [id, a] as const;
        })),
      ]);

      const mMap: Record<string, Master> = {};
      for (const [id, m] of mEntries) if (m) mMap[id] = m;
      setMasters(mMap);

      const aMap: Record<string, Account> = {};
      for (const [id, a] of aEntries) if (a) aMap[id] = a;
      setAccounts(aMap);
    } catch {
      setFollowers([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const updateFollower = async (id: string, patch: Partial<Follower>) => {
    setFollowers(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
    try {
      await fetch(`/api/copy/followers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch {
      load();
    }
  };

  const unfollow = async (f: Follower) => {
    setConfirmUnfollow(null);
    try {
      await fetch(`/api/copy/followers/${f.id}`, { method: 'DELETE' });
      load();
    } catch {
      load();
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: tone.dim, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>Loading subscriptions…</div>;
  }

  if (followers.length === 0) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center' }}>
        <Users size={28} style={{ color: tone.dim, margin: '0 auto 12px' }} />
        <div style={{ color: tone.muted, fontSize: 13, fontWeight: 500, marginBottom: 6 }}>You aren’t following anyone yet</div>
        <div style={{ color: tone.dim, fontSize: 11 }}>Use the wizard and pick a Signal Provider to start copying.</div>
      </div>
    );
  }

  return (
    <div>
      {confirmUnfollow && (
        <ConfirmDialog
          title="Stop following this provider?"
          message={`This disconnects "${masters[confirmUnfollow.masterId || '']?.strategyName || 'this provider'}" from your account. New trades will no longer be copied. Existing open positions are not affected.`}
          confirmText="Unfollow"
          onConfirm={() => unfollow(confirmUnfollow)}
          onCancel={() => setConfirmUnfollow(null)}
          danger
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: tone.border }}>
        {followers.map(f => {
          const m    = f.masterId  ? masters[f.masterId]   : null;
          const acct = f.accountId ? accounts[f.accountId] : null;
          const isOpen = expanded === f.id;

          return (
            <div key={f.id} style={{ background: tone.panel }}>
              <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ color: tone.text, fontSize: 14, fontWeight: 600 }}>
                      {m?.strategyName || (m ? 'Untitled Strategy' : 'Provider unavailable')}
                    </span>
                    <span style={{
                      fontSize: 8, padding: '2px 6px', fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em',
                      background: f.isActive ? 'rgba(74,222,128,0.1)' : 'rgba(251,191,36,0.1)',
                      border: `1px solid ${f.isActive ? 'rgba(74,222,128,0.3)' : 'rgba(251,191,36,0.3)'}`,
                      color: f.isActive ? tone.green : tone.amber,
                    }}>{f.isActive ? '● Copying' : '⏸ Paused'}</span>
                  </div>
                  <div style={{ color: tone.dim, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                    Mirroring to {acct ? `${acct.platform} · ${acct.loginId}` : 'account ' + (f.accountId?.slice(0, 8) || '—')}
                    {' · '}{f.lotMode === 'mult' ? `${f.lotMultiplier}× lot` : f.lotMode === 'fixed' ? `${f.fixedLot} fixed lot` : `${f.riskPercent}% risk`}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Btn size="xs" onClick={() => setExpanded(isOpen ? null : f.id)}>
                    {isOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {isOpen ? 'Close' : 'Settings'}
                  </Btn>
                  <Btn size="xs" danger onClick={() => setConfirmUnfollow(f)}>
                    <UserMinus size={11} /> Unfollow
                  </Btn>
                </div>
              </div>

              {isOpen && (
                <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${tone.border}` }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, marginTop: 16 }}>
                    <div>
                      <div style={{ color: tone.muted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <SettingsIcon size={11} /> Copy Behavior
                      </div>
                      <Toggle on={f.isActive}
                              onChange={v => updateFollower(f.id, { isActive: v })}
                              label="Active subscription"
                              sub="Pause to stop copying without unfollowing" />
                      <Select label="Lot Sizing Mode"
                              value={f.lotMode}
                              onChange={v => updateFollower(f.id, { lotMode: v })}
                              options={[
                                { v: 'mult',  l: 'Multiplier (× provider lot)' },
                                { v: 'fixed', l: 'Fixed lot size' },
                                { v: 'risk',  l: 'Risk % of balance' },
                              ]} />
                      <Select label="Direction"
                              value={f.direction || 'same'}
                              onChange={v => updateFollower(f.id, { direction: v })}
                              options={[
                                { v: 'same',    l: 'Same as provider' },
                                { v: 'reverse', l: 'Reverse provider' },
                                { v: 'hedge',   l: 'Hedge (offset)' },
                              ]} />
                    </div>

                    <div>
                      <div style={{ color: tone.muted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ShieldCheck size={11} /> Risk &amp; Sizing
                      </div>
                      {f.lotMode === 'mult' && (
                        <NumberField label="Lot Multiplier" suffix="×" step={0.1}
                                     value={f.lotMultiplier || '1.0'}
                                     onChange={v => updateFollower(f.id, { lotMultiplier: v })} />
                      )}
                      {f.lotMode === 'fixed' && (
                        <NumberField label="Fixed Lot Size" suffix="lot" step={0.01}
                                     value={f.fixedLot || '0.01'}
                                     onChange={v => updateFollower(f.id, { fixedLot: v })} />
                      )}
                      {f.lotMode === 'risk' && (
                        <NumberField label="Risk per Trade" suffix="%" step={0.1}
                                     value={f.riskPercent || '1.0'}
                                     onChange={v => updateFollower(f.id, { riskPercent: v })} />
                      )}
                      <NumberField label="Max Open Trades" step={1}
                                   value={String(f.maxOpenTrades ?? 10)}
                                   onChange={v => updateFollower(f.id, { maxOpenTrades: parseInt(v, 10) || 0 } as any)} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main exported dashboard ─────────────────────────────────────────────────
export default function CopyManagementDashboard({ onBack, initialTab = 'provider' }: { onBack: () => void; initialTab?: 'provider' | 'follower' }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<'provider' | 'follower'>(initialTab);
  const [refreshKey, setRefreshKey] = useState(0);

  if (!user?.id) {
    return (
      <div style={{ minHeight: '100vh', background: tone.bg, color: tone.text, padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <AlertTriangle size={32} style={{ color: tone.amber, margin: '0 auto 12px' }} />
          <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Sign in to manage your terminals</h2>
          <p style={{ color: tone.muted, fontSize: 12, marginBottom: 20 }}>Your provider and follower accounts are tied to your user profile.</p>
          <Btn onClick={onBack} variant="solid">← Back</Btn>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: tone.bg, color: tone.text, fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${tone.border}`, background: tone.panel, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ color: tone.muted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.25em', marginBottom: 4 }}>
            Trade Sync · Account Manager
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 300, letterSpacing: '-0.01em', margin: 0 }}>My Terminals</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn onClick={() => setRefreshKey(k => k + 1)}><RefreshCw size={11} /> Refresh</Btn>
          <Btn onClick={onBack}><X size={11} /> Close</Btn>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${tone.border}`, background: tone.panel }}>
        {[
          { id: 'provider' as const, label: 'Provider Accounts', icon: Radio,  desc: 'Strategies you broadcast' },
          { id: 'follower' as const, label: 'My Subscriptions',  icon: Users,  desc: 'Providers you copy' },
        ].map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id}
                    onClick={() => setTab(t.id)}
                    style={{
                      flex: '1 1 200px',
                      padding: '14px 20px',
                      background: active ? tone.bg : 'transparent',
                      border: 'none',
                      borderBottom: active ? `2px solid ${tone.blue}` : '2px solid transparent',
                      color: active ? tone.text : tone.muted,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s',
                    }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <Icon size={13} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>{t.label}</span>
              </div>
              <div style={{ color: tone.dim, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>{t.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div style={{ padding: 16, maxWidth: 1100, margin: '0 auto' }}>
        {tab === 'provider' ? <ProviderTab key={`p-${refreshKey}`} userId={user.id} /> : <FollowerTab key={`f-${refreshKey}`} userId={user.id} />}
      </div>
    </div>
  );
}
