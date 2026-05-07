import { useState } from 'react';
import { Wallet, Clock, ChevronRight, Plus, Trash2, ArrowUpRight, MoreVertical, Terminal } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useSessionBalance } from '@/hooks/useSessionBalance';

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
// OBSIDIAN SESSIONS DESIGN
// ─────────────────────────────────────────────────────────────────────────────

// Font constants — used inline on every element to defeat global CSS bleed
const MONO = "'DM Mono', ui-monospace, monospace";
const UI   = "'Inter', system-ui, -apple-system, sans-serif";

// Modal colour tokens (kept minimal — only modals use these)
const MC = {
  bg:         "#1c1c1c",
  border:     "#333333",
  borderSoft: "#2a2a2a",
  accentLow:  "#888888",
  accentFaint:"#444444",
  white:      "#ffffff",
  red:        "#e05555",
};

const SESSION_CARDS_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');

  /* ── isolation: block every inherited font/color from the journal shell ── */
  .obs-sessions-root {
    font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
    font-size: 14px !important;
    color: #dbdbdb !important;
    background: #1c1c1c !important;
    -webkit-font-smoothing: antialiased;
    line-height: 1.5 !important;
  }
  .obs-sessions-root *, .obs-sessions-root *::before, .obs-sessions-root *::after {
    box-sizing: border-box;
  }

  /* modal helpers */
  .sc-input { font-family: 'DM Mono', ui-monospace, monospace; }
  .sc-input::placeholder { color: #444; }
  .sc-input:focus { outline: none; border-color: #888 !important; }
  .sc-btn {
    font-size: 9px; text-transform: uppercase; letter-spacing: 0.16em;
    font-weight: 600; padding: 5px 12px;
    border: 1px solid #333; background: transparent; color: #888;
    cursor: pointer; transition: all 0.15s;
    font-family: 'DM Mono', ui-monospace, monospace;
  }
  .sc-btn:hover   { background: #333; color: #fff; }
  .sc-btn-danger  { color: rgba(224,85,85,0.6); border-color: #333; }
  .sc-btn-danger:hover { background: rgba(224,85,85,0.08); color: #e05555; }
  .sc-btn-primary { color: #a882ff; border-color: #333; }
  .sc-btn-primary:hover { color: #fff; background: rgba(168,130,255,0.12); }
`;

function SCBtn({ label, dim, danger, onClick, testId }: {
  label: string; dim?: boolean; danger?: boolean; onClick?: () => void; testId?: string;
}) {
  const cls = ['sc-btn', danger ? 'sc-btn-danger' : dim ? '' : 'sc-btn-primary'].filter(Boolean).join(' ');
  return (
    <button onClick={onClick} data-testid={testId} className={cls}>
      {label}
    </button>
  );
}

function SCModal({ title, danger, onClose, children }: {
  title: string; danger?: boolean; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(8,9,13,0.88)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: MC.bg, border: `1px solid ${MC.border}`,
        padding: "28px 28px 24px", width: 360, fontFamily: MONO,
      }}>
        <div style={{ fontSize: 10, letterSpacing: "0.2em", color: danger ? MC.red : MC.accentLow, marginBottom: 24 }}>
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
      <div style={{ fontSize: 8, color: MC.accentFaint, letterSpacing: "0.16em", marginBottom: 7, fontFamily: MONO }}>{label}</div>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus}
        className="sc-input"
        style={{
          width: "100%", background: MC.bg, border: `1px solid ${MC.border}`,
          padding: "10px 12px", color: MC.white,
          fontFamily: MONO, fontSize: 12, letterSpacing: "0.04em",
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
        <div style={{ fontSize: 10, color: MC.red, marginBottom: 12, fontFamily: MONO }}>{error}</div>
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
        <div style={{ fontSize: 10, color: MC.red, marginBottom: 12, fontFamily: MONO }}>{error}</div>
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
      <div style={{ fontSize: 11, color: MC.accentLow, lineHeight: 1.9, marginBottom: 22, letterSpacing: '0.03em', fontFamily: MONO }}>
        remove <span style={{ color: MC.white }}>{session.sessionName.toLowerCase()}</span>?<br />this cannot be undone.
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <SCBtn label="cancel" dim onClick={onClose} />
        <SCBtn label={isPending ? '...' : 'delete'} danger onClick={onConfirm} testId={`button-delete-session-${session.id}`} />
      </div>
    </SCModal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOTAL SLOTS
// ─────────────────────────────────────────────────────────────────────────────

const TOTAL_SLOTS = 6;

// ─────────────────────────────────────────────────────────────────────────────
// GHOST CARD — exact reference design
// ─────────────────────────────────────────────────────────────────────────────

function GhostCard({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      className="bg-[#1c1c1c] flex flex-col min-h-[320px] group hover:bg-[#212121] transition-colors cursor-pointer border-l border-t border-[#333]"
      onClick={onCreate}
    >
      {/* Tab header */}
      <div className="flex justify-between items-center bg-[#262626]/30 px-3 py-1.5 border-b border-[#121212]">
        <span
          className="text-[10px] text-[#444] font-bold uppercase tracking-widest"
          style={{ fontFamily: MONO }}
        >SESSION: UNTITLED</span>
        <Plus size={12} className="text-[#333] group-hover:text-[#666]" />
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center space-y-3 opacity-30 group-hover:opacity-100 transition-opacity">
        <Terminal size={22} className="text-[#444]" />
        <p
          className="text-[10px] uppercase tracking-[0.3em] font-bold text-[#555]"
          style={{ fontFamily: MONO }}
        >Initialize Slot</p>
      </div>

      {/* Footer */}
      <div className="p-4">
        <button
          className="w-full border border-dashed border-[#333] group-hover:border-[#a882ff]/50 py-2 text-[9px] uppercase tracking-widest font-bold text-[#444] group-hover:text-[#a882ff] transition-all"
          style={{ fontFamily: UI }}
        >Create Session</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION CARD — exact reference design with live data
// ─────────────────────────────────────────────────────────────────────────────

const SessionCard = ({ session, isActive, onSelect, onEdit, onDelete }: {
  session: SessionData;
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const { totalPnL, tradeCount, isLoading: balLoading } = useSessionBalance(session.id);
  const startBal  = parseFloat(session.startingBalance) || 0;
  const hasData   = !balLoading && tradeCount > 0;
  const equity    = startBal + totalPnL;
  const returnPct = startBal > 0 ? (totalPnL / startBal) * 100 : 0;
  const pnlPos    = totalPnL >= 0;

  // Exact Tailwind colour classes — full strings so Tailwind doesn't purge them
  const pnlClass = !hasData ? 'text-[#555]' : pnlPos ? 'text-emerald-400' : 'text-red-400';

  const pnlVal = !hasData ? '—'
    : `${pnlPos ? '+' : '-'}$${Math.abs(totalPnL).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const retVal    = !hasData ? '—' : `${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}%`;
  const equityStr = hasData
    ? `$${equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${startBal.toLocaleString()}`;

  return (
    <div
      className="bg-[#1c1c1c] flex flex-col min-h-[320px] group cursor-pointer hover:bg-[#212121] transition-colors"
      onClick={onSelect}
      data-testid={`card-session-${session.id}`}
    >
      {/* File Tab Header */}
      <div className="flex justify-between items-center bg-[#262626] border-b border-[#121212] px-3 py-1.5">
        <div className="flex items-center overflow-hidden">
          <span
            className="text-[11px] font-semibold text-[#dbdbdb] truncate tracking-tight"
            style={{ fontFamily: MONO }}
            data-testid={`text-session-name-${session.id}`}
          >SESSION: {session.sessionName.toUpperCase()}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isActive
            ? <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
            : <div className={`w-1.5 h-1.5 rounded-full ${hasData ? 'bg-amber-500 opacity-50' : 'bg-[#444]'}`} />
          }
          <MoreVertical size={14} className="text-[#555] hover:text-white cursor-pointer" />
        </div>
      </div>

      {/* Document Body */}
      <div className="p-6 flex-1 flex flex-col">

        {/* Current Equity */}
        <div className="flex justify-between items-start mb-8">
          <div className="space-y-1">
            <span
              className="text-[9px] uppercase tracking-[0.25em] text-[#666] font-bold"
              style={{ fontFamily: MONO }}
            >Current_Equity</span>
            <h2
              className="text-[11px] font-bold text-white tracking-tighter"
              style={{ fontFamily: MONO }}
            >{equityStr}</h2>
          </div>
          <ArrowUpRight
            size={20}
            className={`${pnlPos || !hasData ? 'text-emerald-500' : 'text-red-400'} opacity-40`}
          />
        </div>

        {/* Stat rows — exact reference structure */}
        <div className="space-y-4" style={{ fontFamily: MONO }}>
          <div className="flex justify-between text-[11px] border-b border-[#2a2a2a] pb-2">
            <span className="text-[#666]"># net-profit-loss</span>
            <span className={`${pnlClass} font-bold tracking-tight`}>{pnlVal}</span>
          </div>
          <div className="flex justify-between text-[11px] border-b border-[#2a2a2a] pb-2">
            <span className="text-[#666]"># total-return</span>
            <span className="text-[#a882ff] font-bold">{retVal}</span>
          </div>
          <div className="flex justify-between text-[11px] border-b border-[#2a2a2a] pb-2">
            <span className="text-[#666]"># trade-count</span>
            <span className="text-white font-bold">{tradeCount}</span>
          </div>
        </div>

        {/* Card Actions */}
        <div
          className="mt-auto pt-6 flex gap-2"
          style={{ fontFamily: UI }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="flex-1 bg-[#262626] hover:bg-[#333] border border-[#3a3a3a] text-[#dbdbdb] text-[10px] uppercase tracking-widest font-bold py-2 transition-colors"
            onClick={onEdit}
          >Edit Session</button>
          <button
            className="px-3 bg-[#262626] hover:bg-red-900/20 border border-[#3a3a3a] text-[#555] hover:text-red-500 transition-colors flex items-center"
            onClick={onDelete}
            data-testid={`button-delete-session-${session.id}`}
          >
            <Trash2 size={14} />
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
// GHOST SESSIONS PANEL
// ─────────────────────────────────────────────────────────────────────────────

export function GhostSessionsPanel({ onCreated }: { onCreated?: (id: string) => void }) {
  const [showCreate, setShowCreate] = useState(false);
  return (
    <div className="obs-sessions-root">
      <style>{SESSION_CARDS_CSS}</style>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[1px] bg-[#333] border border-[#333]">
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
  const [showCreate, setShowCreate]   = useState(false);
  const [editTarget, setEditTarget]   = useState<SessionData | null>(null);
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
      <div className="obs-sessions-root" style={{ padding: '80px 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{SESSION_CARDS_CSS}</style>
        <span style={{ fontSize: 10, color: '#555', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: MONO }}>
          Loading sessions...
        </span>
      </div>
    );
  }

  const ghostsNeeded = Math.max(0, TOTAL_SLOTS - sessions.length);

  return (
    <div className="obs-sessions-root">
      <style>{SESSION_CARDS_CSS}</style>

      {/* Exact reference grid: gap-[1px] bg-[#333] border border-[#333] */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[1px] bg-[#333] border border-[#333]">
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
    </div>
  );
};
