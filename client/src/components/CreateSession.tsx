import { useState, useEffect } from 'react';
import { Globe, Wallet, Clock, ChevronRight } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useSessionBalance } from '@/hooks/useSessionBalance';

function usePulse() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = setInterval(() => setOn(v => !v), 1500);
    return () => clearInterval(t);
  }, []);
  return on;
}

function useVisible(delay = 0) {
  const [v, setV] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setV(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return v;
}

interface SessionData {
  id: string;
  sessionName: string;
  startingBalance: string;
  status: string | null;
  createdAt: string | null;
}

interface CreateSessionFormProps {
  onCreated: (sessionId: string) => void;
}

const FONT_IMPORT = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=Syne:wght@400;500;600;700;800&family=Montserrat:wght@400;500;600;700;800;900&display=swap');
`;

export const CreateSessionForm = ({ onCreated }: CreateSessionFormProps) => {
  const [sessionName, setSessionName] = useState('');
  const [startingBalance, setStartingBalance] = useState('');
  const [formError, setFormError] = useState('');

  const createMutation = useMutation({
    mutationFn: async (data: { sessionName: string; startingBalance: number }) => {
      const res = await apiRequest("POST", "/api/sessions", data);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.details || err.error || 'Failed to create session');
      }
      return res.json();
    },
    onSuccess: (session: SessionData) => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      setSessionName('');
      setStartingBalance('');
      setFormError('');
      onCreated(session.id);
    },
    onError: (error: Error) => {
      setFormError(error.message || 'Failed to create session. Please try again.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const balance = parseFloat(startingBalance);
    if (!startingBalance.trim() || isNaN(balance) || balance < 0) {
      setFormError('Please enter a valid starting balance (must be 0 or greater).');
      return;
    }
    if (!sessionName.trim()) {
      setFormError('Please enter a session name.');
      return;
    }
    createMutation.mutate({ sessionName: sessionName.trim(), startingBalance: balance });
  };

  return (
    <>
      <style>{FONT_IMPORT}{`
        .csf-input { width: 100%; box-sizing: border-box; }
        .csf-input:focus { outline: none; border-color: rgba(99,102,241,0.6) !important; background: rgba(99,102,241,0.05) !important; }
        .csf-deploy:not(:disabled):hover { background: #5254cc !important; }
        .csf-deploy:not(:disabled):active { transform: translateY(1px); }
      `}</style>
      <div className="csf-root" style={{ width: '100%', maxWidth: 460, margin: '0 auto', paddingBottom: 8 }}>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, background: '#4f46e5',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16,
          }}>
            <ChevronRight size={26} color="#fff" strokeWidth={1.5} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '0.12em', color: '#ffffff', textTransform: 'uppercase', marginBottom: 6, fontFamily: "'Syne', sans-serif" }}>
            Create New Session
          </div>
          <div style={{ fontSize: 9, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>
            System Initialisation Required
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="form-create-session">

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>
              <Clock size={9} style={{ color: 'rgba(255,255,255,0.35)' }} />
              Session Identifier
            </label>
            <input
              type="text"
              required
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="E.G. NASDAQ_SCALP_01"
              className="csf-input"
              data-testid="input-session-name"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 0,
                padding: '13px 16px',
                fontSize: 12,
                fontWeight: 500,
                color: '#ffffff',
                letterSpacing: '0.06em',
                transition: 'border-color 0.2s, background 0.2s',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>
              <Wallet size={9} style={{ color: 'rgba(255,255,255,0.35)' }} />
              Initial Liquidity
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                color: 'rgba(255,255,255,0.5)', fontSize: 13,
              }}>$</span>
              <input
                type="number"
                value={startingBalance}
                onChange={(e) => setStartingBalance(e.target.value)}
                placeholder="10000"
                min="0"
                step="0.01"
                className="csf-input"
                data-testid="input-starting-balance"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 0,
                  padding: '13px 16px 13px 32px',
                  fontSize: 12,
                  fontWeight: 500,
                  color: '#ffffff',
                  letterSpacing: '0.06em',
                  transition: 'border-color 0.2s, background 0.2s',
                }}
              />
            </div>
          </div>

          {formError && (
            <div style={{ background: 'rgba(255,77,77,0.08)', border: '1px solid rgba(255,77,77,0.25)', padding: '10px 14px' }}>
              <p style={{ fontSize: 11, color: '#ff7070', margin: 0 }} data-testid="text-form-error">{formError}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={createMutation.isPending}
            className="csf-deploy"
            data-testid="button-create-session"
            style={{
              width: '100%',
              background: '#4f46e5',
              border: 'none',
              borderRadius: 0,
              padding: '15px 20px',
              color: '#ffffff',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              cursor: createMutation.isPending ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s, transform 0.1s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              opacity: createMutation.isPending ? 0.7 : 1,
              marginTop: 4,
            }}
          >
            {createMutation.isPending ? (
              <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            ) : (
              <>Deploy Session <ChevronRight size={13} /></>
            )}
          </button>
        </form>

        <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
            Status: <span style={{ color: '#6366f1' }}>Ready</span>
          </div>
          <div style={{ width: 48, height: 2, background: '#4f46e5' }} />
        </div>
      </div>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SESSION CARDS — NEW DESIGN (DM Mono, minimal, monospace)
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  pageBg:     "#08090d",
  panelBg:    "#0d0e14",
  cardBg:     "#12131a",
  cardHover:  "#15161f",
  ghostBg:    "#0f1018",
  border:     "#1e2030",
  borderSoft: "#181926",
  accent:     "#c8cad8",
  accentLow:  "#6b6e85",
  accentFaint:"#2e3048",
  white:      "#f0f1f5",
  dimText:    "#3a3c52",
  red:        "#e05555",
  mono:       "'DM Mono', monospace",
};

const SESSION_CARDS_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');
  @keyframes sc-breathe { 0%,100%{opacity:1} 50%{opacity:0.25} }
  @keyframes sc-fadeUp {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .sc-live-card { animation: sc-fadeUp 0.35s ease both; transition: background 0.2s, border-color 0.2s; }
  .sc-live-card:hover { background: ${C.cardHover} !important; }
  .sc-input { font-family: ${C.mono}; }
  .sc-input::placeholder { color: ${C.accentFaint}; }
  .sc-input:focus { outline: none; border-color: ${C.accentLow} !important; }
`;

function SCStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
      <span style={{ fontSize: 9, color: C.accentFaint, letterSpacing: "0.14em", fontFamily: C.mono }}>{label}</span>
      <span style={{ fontSize: 13, color: color || C.accentLow, letterSpacing: "0.03em", fontFamily: C.mono }}>{value}</span>
    </div>
  );
}

function SCDiv({ v }: { v?: boolean }) {
  return <div style={{ width: v ? 1 : "100%", height: v ? "100%" : 1, background: C.borderSoft, flexShrink: 0 }} />;
}

function SCBadge({ live }: { live: boolean }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 9px",
      border: `1px solid ${live ? C.border : C.borderSoft}`,
      background: live ? C.accentFaint : "transparent",
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: "50%",
        background: live ? C.accentLow : C.dimText,
        display: "inline-block",
        animation: live ? "sc-breathe 2.2s ease-in-out infinite" : "none",
      }} />
      <span style={{ fontSize: 9, color: live ? C.accentLow : C.dimText, letterSpacing: "0.12em", fontFamily: C.mono }}>
        {live ? "live" : "idle"}
      </span>
    </div>
  );
}

function SCBtn({ label, dim, danger, onClick, testId }: { label: string; dim?: boolean; danger?: boolean; onClick?: () => void; testId?: string }) {
  const [hov, setHov] = useState(false);
  const borderCol = danger
    ? (hov ? C.red : "rgba(224,85,85,0.3)")
    : dim ? (hov ? C.border : C.borderSoft) : (hov ? C.accentLow : C.border);
  const textCol = danger
    ? (hov ? C.red : "rgba(224,85,85,0.5)")
    : dim ? (hov ? C.accentLow : C.dimText) : (hov ? C.accent : C.accentLow);
  return (
    <button onClick={onClick} data-testid={testId}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        fontFamily: C.mono, fontSize: 9, letterSpacing: "0.1em",
        padding: "5px 13px", cursor: "pointer",
        border: `1px solid ${borderCol}`,
        background: "transparent", color: textCol,
        transition: "all 0.15s",
      }}>
      {label}
    </button>
  );
}

function SCModal({ title, danger, onClose, children }: { title: string; danger?: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(8,9,13,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.cardBg, border: `1px solid ${C.border}`,
        padding: "28px 28px 24px", width: 360, fontFamily: C.mono,
      }}>
        <div style={{ fontSize: 10, letterSpacing: "0.2em", color: danger ? C.red : C.accentLow, marginBottom: 24 }}>
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}

function SCField({ label, value, onChange, type = "text", placeholder, autoFocus }: {
  label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string; placeholder?: string; autoFocus?: boolean;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 8, color: C.accentFaint, letterSpacing: "0.16em", marginBottom: 7, fontFamily: C.mono }}>{label}</div>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus}
        className="sc-input"
        style={{
          width: "100%", background: C.pageBg, border: `1px solid ${C.border}`,
          padding: "10px 12px", color: C.white,
          fontFamily: C.mono, fontSize: 12, letterSpacing: "0.04em",
          boxSizing: "border-box",
        }} />
    </div>
  );
}

const GH = {
  bg: "#0D0F1C",
  surface: C.cardBg,
  surfaceDeep: C.pageBg,
  border: C.border,
  green: C.accent,
  greenDim: "rgba(255,255,255,0.06)",
  greenBorder: C.borderSoft,
  textPrimary: C.white,
  textMuted: C.accentLow,
  red: C.red,
};

function GhostCreateModal({ onClose, onCreated }: { onClose: () => void; onCreated?: (id: string) => void }) {
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: async (data: { sessionName: string; startingBalance: number }) => {
      const res = await apiRequest('POST', '/api/sessions', data);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.details || err.error || 'Failed to create session');
      }
      return res.json();
    },
    onSuccess: (session: SessionData) => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      onClose();
      onCreated?.(session.id);
    },
    onError: (e: Error) => setError(e.message || 'Failed to create session.'),
  });

  const submit = () => {
    setError('');
    if (!name.trim()) { setError('Please enter a session name.'); return; }
    const bal = parseFloat(balance);
    if (!balance || isNaN(bal) || bal < 0) { setError('Please enter a valid starting balance.'); return; }
    createMutation.mutate({ sessionName: name.trim().toUpperCase(), startingBalance: bal });
  };

  return (
    <SCModal title="new session" onClose={onClose}>
      <SCField label="session name" value={name} onChange={(e) => setName(e.target.value)} placeholder="alpha-01" autoFocus />
      <SCField label="starting balance ($)" value={balance} onChange={(e) => setBalance(e.target.value)} type="number" placeholder="5000" />
      {error && (
        <div style={{ fontSize: 10, color: C.red, marginBottom: 12, fontFamily: C.mono }}>{error}</div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <SCBtn label="cancel" dim onClick={onClose} />
        <SCBtn label={createMutation.isPending ? '...' : 'create'} onClick={submit} testId="button-create-session" />
      </div>
    </SCModal>
  );
}

function EditSessionModal({ session, onClose }: { session: SessionData; onClose: () => void }) {
  const [name, setName] = useState(session.sessionName);
  const [balance, setBalance] = useState(session.startingBalance);
  const [error, setError] = useState('');

  const updateMutation = useMutation({
    mutationFn: async (data: { sessionName: string; startingBalance: string }) => {
      const res = await apiRequest('PUT', `/api/sessions/${session.id}`, data);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.details || err.error || 'Failed to update session');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message || 'Failed to update session.'),
  });

  const submit = () => {
    setError('');
    if (!name.trim()) { setError('Please enter a session name.'); return; }
    const bal = parseFloat(balance);
    if (!balance || isNaN(bal) || bal < 0) { setError('Please enter a valid starting balance.'); return; }
    updateMutation.mutate({ sessionName: name.trim().toUpperCase(), startingBalance: String(bal) });
  };

  return (
    <SCModal title="edit session" onClose={onClose}>
      <SCField label="session name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <SCField label="starting balance ($)" value={balance} onChange={(e) => setBalance(e.target.value)} type="number" />
      {error && (
        <div style={{ fontSize: 10, color: C.red, marginBottom: 12, fontFamily: C.mono }}>{error}</div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <SCBtn label="cancel" dim onClick={onClose} />
        <SCBtn label={updateMutation.isPending ? '...' : 'save'} onClick={submit} />
      </div>
    </SCModal>
  );
}

function DeleteSessionModal({ session, onClose, onConfirm, isPending }: {
  session: SessionData; onClose: () => void; onConfirm: () => void; isPending?: boolean;
}) {
  return (
    <SCModal title="delete session" danger onClose={onClose}>
      <div style={{ fontSize: 11, color: C.accentLow, lineHeight: 1.9, marginBottom: 22, letterSpacing: '0.03em', fontFamily: C.mono }}>
        remove <span style={{ color: C.white }}>{session.sessionName.toLowerCase()}</span>?<br />this cannot be undone.
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <SCBtn label="cancel" dim onClick={onClose} />
        <SCBtn label={isPending ? '...' : 'delete'} danger onClick={onConfirm} testId={`button-delete-session-${session.id}`} />
      </div>
    </SCModal>
  );
}

function GhostCard({ opacity, onCreate }: { opacity: number; onCreate: () => void }) {
  return (
    <div style={{
      background: C.ghostBg,
      border: `1px solid ${C.borderSoft}`,
      padding: 22,
      display: 'flex', flexDirection: 'column', gap: 18,
      opacity,
      fontFamily: C.mono,
    }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, color: C.dimText, letterSpacing: '0.05em', fontFamily: C.mono }}>— — —</span>
          <span style={{ fontSize: 9, color: C.accentFaint, letterSpacing: '0.06em', fontFamily: C.mono }}>— —</span>
        </div>
        <SCBadge live={false} />
      </div>

      {/* balance */}
      <div style={{
        background: C.pageBg, border: `1px solid ${C.borderSoft}`,
        padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <span style={{ fontSize: 9, color: C.accentFaint, letterSpacing: '0.14em', fontFamily: C.mono }}>balance</span>
        <span style={{ fontSize: 11, color: C.dimText, letterSpacing: '0.01em', fontFamily: C.mono }}>$ —</span>
      </div>

      {/* stats */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
        {['p&l', 'return', 'trades'].map((label, i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'stretch', gap: 0, flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
              <span style={{ fontSize: 9, color: C.accentFaint, letterSpacing: '0.14em', fontFamily: C.mono }}>{label}</span>
              <span style={{ fontSize: 13, color: C.dimText, fontFamily: C.mono }}>—</span>
            </div>
            {i < 2 && <><div style={{ width: 16 }} /><SCDiv v /><div style={{ width: 16 }} /></>}
          </div>
        ))}
      </div>

      {/* footer */}
      <div>
        <SCDiv />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14 }}>
          <span style={{ fontSize: 9, color: C.accentFaint, letterSpacing: '0.06em', fontFamily: C.mono }}>no session yet</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <SCBtn label="create" onClick={onCreate} />
            <SCBtn label="delete" dim />
          </div>
        </div>
      </div>
    </div>
  );
}

const SESSIONS_GRID_CSS = `
  .sessions-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  @media (max-width: 700px) { .sessions-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 480px) { .sessions-grid { grid-template-columns: 1fr; } }
`;

const GHOST_CSS = `
  @keyframes ghost-blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
`;

const GHOST_OPACITIES = [0.9, 0.7, 0.5, 0.35, 0.22];
const TOTAL_SLOTS = 6;

export function GhostSessionsPanel({ onCreated }: { onCreated?: (id: string) => void }) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <style>{SESSION_CARDS_CSS}{SESSIONS_GRID_CSS}</style>

      <div className="sessions-grid" style={{ gap: 4 }}>
        {GHOST_OPACITIES.map((op, i) => (
          <GhostCard key={i} opacity={op} onCreate={() => setShowCreate(true)} />
        ))}
      </div>

      {showCreate && (
        <GhostCreateModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); onCreated?.(id); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION CARD (existing sessions) — new LiveCard design
// ─────────────────────────────────────────────────────────────────────────────

const SessionCard = ({ session, isActive, onSelect, onEdit, onDelete }: {
  session: SessionData;
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const { totalPnL, tradeCount, isLoading: balLoading } = useSessionBalance(session.id);
  const startBal = parseFloat(session.startingBalance) || 0;
  const hasData = !balLoading && tradeCount > 0;
  const returnPct = startBal > 0 ? (totalPnL / startBal) * 100 : 0;
  const dateStr = session.createdAt
    ? new Date(session.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  const pnlCol = !hasData ? C.dimText : totalPnL >= 0 ? C.accent : C.red;
  const retCol = !hasData ? C.dimText : returnPct >= 0 ? C.accent : C.red;
  const tradesCol = tradeCount > 0 ? C.accent : C.dimText;

  const pnlVal = !hasData ? '—' : `${totalPnL < 0 ? '-' : ''}$${Math.abs(totalPnL).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const retVal = !hasData ? '—' : `${returnPct.toFixed(2)}%`;

  return (
    <div
      className="sc-live-card"
      onClick={onSelect}
      data-testid={`card-session-${session.id}`}
      style={{
        background: C.cardBg,
        border: `1px solid ${isActive ? C.accentLow : C.border}`,
        padding: 22,
        display: 'flex', flexDirection: 'column', gap: 18,
        cursor: 'pointer',
        fontFamily: C.mono,
      }}
    >
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1, marginRight: 10 }}>
          <span
            data-testid={`text-session-name-${session.id}`}
            style={{ fontSize: 13, fontWeight: 500, color: C.white, letterSpacing: '0.05em', fontFamily: C.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {session.sessionName}
          </span>
          <span style={{ fontSize: 9, color: C.dimText, letterSpacing: '0.06em', fontFamily: C.mono }}>
            {dateStr}
          </span>
        </div>
        <SCBadge live={isActive || hasData} />
      </div>

      {/* BALANCE */}
      <div style={{
        background: C.pageBg, border: `1px solid ${C.borderSoft}`,
        padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <span style={{ fontSize: 9, color: C.accentFaint, letterSpacing: '0.14em', fontFamily: C.mono }}>balance</span>
        <span style={{ fontSize: 11, color: C.white, letterSpacing: '0.01em', fontFamily: C.mono }}>
          ${startBal.toLocaleString()}
        </span>
      </div>

      {/* STATS */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
        <SCStat label="p&l" value={pnlVal} color={pnlCol} />
        <SCDiv v />
        <div style={{ width: 16 }} />
        <SCStat label="return" value={retVal} color={retCol} />
        <SCDiv v />
        <div style={{ width: 16 }} />
        <SCStat label="trades" value={String(tradeCount)} color={tradesCol} />
      </div>

      {/* FOOTER */}
      <div>
        <SCDiv />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14 }}>
          <span style={{ fontSize: 9, color: C.dimText, letterSpacing: '0.06em', fontFamily: C.mono }}>
            {tradeCount === 0 ? 'no trades yet' : `${tradeCount} trade${tradeCount !== 1 ? 's' : ''}`}
          </span>
          <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
            <SCBtn label="edit" onClick={onEdit} />
            <SCBtn label="delete" danger onClick={onDelete} testId={`button-delete-session-${session.id}`} />
          </div>
        </div>
      </div>
    </div>
  );
};

// keep old return wrapped — start of original return body to be removed

interface SessionsListProps {
  onSelectSession: (sessionId: string) => void;
  activeSessionId: string | null;
  onDeleteSession?: (sessionId: string) => void;
  onCreated?: (sessionId: string) => void;
}

function SummaryBar({ sessions }: { sessions: SessionData[] }) {
  const totalBalance = sessions.reduce((a, s) => a + (parseFloat(s.startingBalance) || 0), 0);
  const items = [
    { label: 'sessions', value: String(sessions.length) },
    { label: 'total capital', value: `$${totalBalance.toLocaleString()}` },
    { label: 'total trades', value: '—' },
    { label: 'slots remaining', value: String(Math.max(0, TOTAL_SLOTS - sessions.length)) },
  ];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
      border: `1px solid ${C.border}`, background: C.panelBg,
      marginBottom: 10, fontFamily: C.mono,
    }}>
      {items.map((item, i) => (
        <div key={item.label} style={{
          padding: '16px 20px',
          borderRight: i < 3 ? `1px solid ${C.borderSoft}` : 'none',
        }}>
          <div style={{ fontSize: 8, color: C.accentFaint, letterSpacing: '0.16em', fontFamily: C.mono, marginBottom: 6 }}>
            {item.label}
          </div>
          <div style={{ fontSize: 16, color: C.white, fontFamily: C.mono, letterSpacing: '0.02em' }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export const SessionsList = ({ onSelectSession, activeSessionId, onDeleteSession, onCreated }: SessionsListProps) => {
  const { data: sessions = [], isLoading } = useQuery<SessionData[]>({
    queryKey: ['/api/sessions'],
  });
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<SessionData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SessionData | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/sessions/${id}`);
      return id;
    },
    onSuccess: (deletedId: string) => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/journal/entries'] });
      queryClient.invalidateQueries({ queryKey: ['/api/metrics/compute'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/compute'] });
      queryClient.invalidateQueries({ queryKey: ['/api/drawdown/compute'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics'] });
      setDeleteTarget(null);
      if (onDeleteSession) onDeleteSession(deletedId);
    },
  });

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
        <span style={{ fontSize: 10, color: C.accentLow, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: C.mono }}>Loading sessions...</span>
      </div>
    );
  }

  const ghostsNeeded = Math.max(0, TOTAL_SLOTS - sessions.length);
  const ghosts = GHOST_OPACITIES.slice(0, ghostsNeeded);

  return (
    <>
      <style>{SESSION_CARDS_CSS}{SESSIONS_GRID_CSS}{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ position: 'relative' }}>
        <SummaryBar sessions={sessions} />
        <div className="sessions-grid" style={{ gap: 4 }}>
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              isActive={activeSessionId === session.id}
              onSelect={() => onSelectSession(session.id)}
              onEdit={() => setEditTarget(session)}
              onDelete={() => setDeleteTarget(session)}
            />
          ))}
          {ghosts.map((op, i) => (
            <GhostCard key={`ghost-${i}`} opacity={op} onCreate={() => setShowCreate(true)} />
          ))}
        </div>
      </div>

      {showCreate && (
        <GhostCreateModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); onCreated?.(id); }}
        />
      )}
      {editTarget && (
        <EditSessionModal
          session={editTarget}
          onClose={() => setEditTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeleteSessionModal
          session={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          isPending={deleteMutation.isPending}
        />
      )}
    </>
  );
};
