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

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16 }}>
          <div style={{
            width: 48, height: 48, background: '#4f46e5',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 10,
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

        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
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
// SESSION CARDS — OBSIDIAN DESIGN (DM Mono file-tab style)
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  pageBg:     "#1c1c1c",
  panelBg:    "#262626",
  cardBg:     "#1c1c1c",
  cardHover:  "#212121",
  ghostBg:    "#1c1c1c",
  border:     "#333333",
  borderSoft: "#2a2a2a",
  borderDeep: "#121212",
  accent:     "#dbdbdb",
  accentLow:  "#888888",
  accentFaint:"#444444",
  white:      "#ffffff",
  dimText:    "#555555",
  red:        "#e05555",
  emerald:    "#10b981",
  purple:     "#a882ff",
  mono:       "'DM Mono', ui-monospace, monospace",
  ui:         "'Inter', system-ui, -apple-system, sans-serif",
};

const SESSION_CARDS_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Inter:wght@400;500;600;700&display=swap');
  @keyframes sc-emerald-pulse { 0%,100%{box-shadow:0 0 8px rgba(16,185,129,0.4)} 50%{box-shadow:0 0 14px rgba(16,185,129,0.7)} }
  @keyframes sc-fadeUp { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:translateY(0)} }
  .sc-live-card   { animation: sc-fadeUp 0.3s ease both; }
  .sc-input       { font-family: ${C.mono}; }
  .sc-input::placeholder { color: ${C.accentFaint}; }
  .sc-input:focus { outline: none; border-color: ${C.accentLow} !important; }
  .sc-btn         { font-size:9px; text-transform:uppercase; letter-spacing:0.16em; font-weight:600; padding:5px 12px; border:1px solid ${C.border}; background:${C.panelBg}; color:${C.accentLow}; cursor:pointer; transition:all 0.15s; font-family:${C.ui}; }
  .sc-btn:hover   { background:${C.border}; color:${C.white}; }
  .sc-btn-danger  { color:rgba(224,85,85,0.6); border-color:${C.border}; }
  .sc-btn-danger:hover { background:rgba(224,85,85,0.08); color:${C.red}; }
  .sc-btn-primary { color:#a882ff; border-color:${C.border}; }
  .sc-btn-primary:hover { color:${C.white}; background:rgba(168,130,255,0.12); }
  .sc-jm, .sc-jm * { font-family:${C.mono} !important; }
  .sc-label       { font-size:9px; color:${C.dimText}; font-family:${C.mono}; }
  .sc-sub         { font-size:9px; color:${C.dimText}; font-family:${C.mono}; }
`;

// ── Obsidian stat row item ────────────────────────────────────────────────────
function ObsStatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      borderBottom: `1px solid ${C.borderSoft}`, paddingBottom: 8,
      fontSize: 11, fontFamily: C.mono,
    }}>
      <span style={{ color: C.dimText }}>{label}</span>
      <span style={{ color: color || C.accent, fontWeight: 700, letterSpacing: "-0.01em" }}>{value}</span>
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

// ─────────────────────────────────────────────────────────────────────────────
// OBSIDIAN GRID LAYOUT CSS
// ─────────────────────────────────────────────────────────────────────────────

const SESSIONS_GRID_CSS = `
  .obs-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    background: #333;
    border: 1px solid #333;
  }
  @media (max-width: 900px) { .obs-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 540px) { .obs-grid { grid-template-columns: 1fr; } }
  .obs-ghost:hover .obs-ghost-body { opacity: 1 !important; }
  .obs-ghost:hover .obs-ghost-btn { border-color: rgba(168,130,255,0.5) !important; color: #a882ff !important; }
  .obs-ghost:hover { background: #212121 !important; }
  .obs-card-btn-edit {
    flex: 1;
    background: #262626;
    border: 1px solid #3a3a3a;
    color: #888;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-weight: 700;
    padding: 8px 0;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    font-family: 'Inter', system-ui, sans-serif;
  }
  .obs-card-btn-edit:hover { background: #333; color: #fff; }
  .obs-card-btn-del {
    background: #262626;
    border: 1px solid #3a3a3a;
    color: #555;
    padding: 8px 12px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    display: flex; align-items: center;
  }
  .obs-card-btn-del:hover { background: rgba(224,85,85,0.12); color: #e05555; }
`;

const TOTAL_SLOTS = 6;

// ─────────────────────────────────────────────────────────────────────────────
// GHOST CARD — Obsidian empty slot
// ─────────────────────────────────────────────────────────────────────────────

function GhostCard({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      className="obs-ghost"
      onClick={onCreate}
      style={{
        background: C.pageBg, display: 'flex', flexDirection: 'column',
        minHeight: 320, cursor: 'pointer', transition: 'background 0.15s',
      }}
    >
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(38,38,38,0.3)', borderBottom: `1px solid ${C.borderDeep}`,
        padding: '6px 12px',
      }}>
        <span style={{
          fontSize: 10, color: C.accentFaint, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.25em', fontFamily: C.mono,
        }}>SESSION: UNTITLED</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.accentFaint} strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </div>

      <div
        className="obs-ghost-body"
        style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 10, opacity: 0.3, transition: 'opacity 0.2s',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.accentFaint} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
        </svg>
        <p style={{
          fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.3em',
          fontWeight: 700, color: C.dimText, fontFamily: C.mono,
        }}>Initialize Slot</p>
      </div>

      <div style={{ padding: 16 }}>
        <button
          className="obs-ghost-btn"
          style={{
            width: '100%', border: `1px dashed ${C.border}`,
            padding: '8px 0', fontSize: 9, textTransform: 'uppercase',
            letterSpacing: '0.3em', fontWeight: 700, color: C.accentFaint,
            background: 'transparent', cursor: 'pointer',
            transition: 'all 0.15s', fontFamily: C.ui,
          }}
        >
          Create Session
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION CARD — Obsidian file-tab style
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
  const equity = startBal + totalPnL;
  const returnPct = startBal > 0 ? (totalPnL / startBal) * 100 : 0;

  const pnlPositive = totalPnL >= 0;
  const pnlColor = !hasData ? C.dimText : pnlPositive ? C.emerald : C.red;
  const retColor = !hasData ? C.dimText : returnPct >= 0 ? C.purple : C.red;

  const pnlVal = !hasData ? '—'
    : `${pnlPositive ? '+' : '-'}$${Math.abs(totalPnL).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const retVal = !hasData ? '—' : `${returnPct.toFixed(2)}%`;
  const equityVal = `$${equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const dotColor = isActive ? C.emerald : hasData ? '#f59e0b' : C.dimText;
  const dotGlow = isActive ? '0 0 8px rgba(16,185,129,0.5)' : 'none';

  return (
    <div
      className="sc-live-card"
      onClick={onSelect}
      data-testid={`card-session-${session.id}`}
      style={{
        background: C.pageBg, display: 'flex', flexDirection: 'column',
        minHeight: 320, cursor: 'pointer', transition: 'background 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = C.cardHover)}
      onMouseLeave={e => (e.currentTarget.style.background = C.pageBg)}
    >
      {/* FILE TAB HEADER */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: C.panelBg, borderBottom: `1px solid ${C.borderDeep}`,
        padding: '6px 12px',
      }}>
        <span
          data-testid={`text-session-name-${session.id}`}
          style={{
            fontSize: 11, fontWeight: 600, color: C.accent,
            fontFamily: C.mono, letterSpacing: '-0.01em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          SESSION: {session.sessionName.toUpperCase()}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: dotColor, boxShadow: dotGlow,
            animation: isActive ? 'sc-emerald-pulse 2s ease-in-out infinite' : 'none',
          }} />
        </div>
      </div>

      {/* CARD BODY */}
      <div style={{ padding: 24, flex: 1, display: 'flex', flexDirection: 'column' }}>

        {/* EQUITY */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{
              fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.25em',
              color: C.dimText, fontWeight: 700, fontFamily: C.mono,
            }}>Current_Equity</span>
            <span style={{
              fontSize: 18, fontWeight: 700, color: C.white,
              fontFamily: C.mono, letterSpacing: '-0.02em',
            }}>
              {hasData ? equityVal : `$${startBal.toLocaleString()}`}
            </span>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke={pnlPositive || !hasData ? C.emerald : C.red}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ opacity: 0.4 }}>
            <line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>
          </svg>
        </div>

        {/* STAT ROWS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
          <ObsStatRow label="# net-profit-loss" value={pnlVal} color={pnlColor} />
          <ObsStatRow label="# total-return" value={retVal} color={retColor} />
          <ObsStatRow label="# trade-count" value={String(tradeCount)} color={tradeCount > 0 ? C.accent : C.dimText} />
        </div>

        {/* ACTION BUTTONS */}
        <div
          style={{ marginTop: 24, display: 'flex', gap: 6 }}
          onClick={e => e.stopPropagation()}
        >
          <button className="obs-card-btn-edit" onClick={onEdit}>Edit Session</button>
          <button className="obs-card-btn-del" onClick={onDelete} data-testid={`button-delete-session-${session.id}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SESSIONS LIST PROPS
// ─────────────────────────────────────────────────────────────────────────────

interface SessionsListProps {
  onSelectSession: (sessionId: string) => void;
  activeSessionId: string | null;
  onDeleteSession?: (sessionId: string) => void;
  onCreated?: (sessionId: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// GHOST SESSIONS PANEL (shown before any sessions exist)
// ─────────────────────────────────────────────────────────────────────────────

export function GhostSessionsPanel({ onCreated }: { onCreated?: (id: string) => void }) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <style>{SESSION_CARDS_CSS}</style>
      <div className="obs-grid">
        {Array.from({ length: TOTAL_SLOTS }).map((_, i) => (
          <GhostCard key={i} onCreate={() => setShowCreate(true)} />
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
// SESSIONS LIST — main export
// ─────────────────────────────────────────────────────────────────────────────

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
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '80px 0', background: C.pageBg,
      }}>
        <span style={{ fontSize: 10, color: C.dimText, letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: C.mono }}>
          Loading sessions...
        </span>
      </div>
    );
  }

  const ghostsNeeded = Math.max(0, TOTAL_SLOTS - sessions.length);

  return (
    <>
      <style>{SESSION_CARDS_CSS}{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div className="obs-grid">
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
        {Array.from({ length: ghostsNeeded }).map((_, i) => (
          <GhostCard key={`ghost-${i}`} onCreate={() => setShowCreate(true)} />
        ))}
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
