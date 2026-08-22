import { useState, useRef, useEffect } from 'react';
import { Wallet, Clock, ChevronRight, Plus, Trash2, ArrowUpRight, MoreVertical, Terminal } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useSessionBalance } from '@/hooks/useSessionBalance';

interface SessionData {
  id: string;
  sessionName: string;
  startingBalance: string;
  brokerTimezone: number | null;
  status: string | null;
  createdAt: string | null;
  brokerBacked?: boolean;   // set server-side: true if this session backs a broker account
}

const TZ_OPTIONS = [
  { value: "-12", label: "UTC-12 (Baker Island)" },
  { value: "-11", label: "UTC-11 (American Samoa)" },
  { value: "-10", label: "UTC-10 (Hawaii)" },
  { value: "-9",  label: "UTC-9  (Alaska)" },
  { value: "-8",  label: "UTC-8  (Pacific Standard / PST)" },
  { value: "-7",  label: "UTC-7  (Mountain Standard / MST)" },
  { value: "-6",  label: "UTC-6  (Central Standard / CST)" },
  { value: "-5",  label: "UTC-5  (New York winter / EST)" },
  { value: "-4",  label: "UTC-4  (New York summer / EDT)" },
  { value: "-3",  label: "UTC-3  (Buenos Aires / BRT)" },
  { value: "-2",  label: "UTC-2  (Mid-Atlantic)" },
  { value: "-1",  label: "UTC-1  (Azores)" },
  { value: "0",   label: "UTC+0  (London winter / GMT)" },
  { value: "1",   label: "UTC+1  (London summer / BST)" },
  { value: "2",   label: "UTC+2  (Broker EET winter)" },
  { value: "3",   label: "UTC+3  (Broker EEST summer)" },
  { value: "4",   label: "UTC+4  (Dubai / GST)" },
  { value: "5",   label: "UTC+5  (Pakistan / PKT)" },
  { value: "5.5", label: "UTC+5:30 (India / IST)" },
  { value: "6",   label: "UTC+6  (Bangladesh / BST)" },
  { value: "7",   label: "UTC+7  (Bangkok / ICT)" },
  { value: "8",   label: "UTC+8  (Singapore / SGT)" },
  { value: "9",   label: "UTC+9  (Tokyo / JST)" },
  { value: "10",  label: "UTC+10 (Sydney / AEST)" },
  { value: "11",  label: "UTC+11 (Solomon Islands)" },
  { value: "12",  label: "UTC+12 (Auckland / NZST)" },
];

function SCSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = TZ_OPTIONS.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ marginBottom: 14, position: 'relative' }}>
      <div style={{ fontSize: 8, color: MC.accentFaint, letterSpacing: "0.16em", marginBottom: 7, fontFamily: MONO }}>{label}</div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", background: MC.bg, border: `1px solid ${open ? "#6366f1" : MC.border}`,
          padding: "10px 12px", color: MC.white,
          fontFamily: MONO, fontSize: 12, letterSpacing: "0.04em",
          boxSizing: "border-box", cursor: "pointer",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          textAlign: "left", transition: "border-color 0.15s",
        }}
      >
        <span>{selected?.label ?? "Select timezone"}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          <path d="M1 3l4 4 4-4" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 9999,
          background: MC.bg, border: `1px solid #6366f1`,
          borderTop: "none", maxHeight: 220, overflowY: "auto",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}>
          {TZ_OPTIONS.map(o => (
            <div
              key={o.value}
              onMouseDown={() => { onChange(o.value); setOpen(false); }}
              style={{
                padding: "9px 12px", cursor: "pointer", fontFamily: MONO,
                fontSize: 12, letterSpacing: "0.04em",
                color: o.value === value ? "#a5b4fc" : MC.white,
                background: o.value === value ? "rgba(99,102,241,0.15)" : "transparent",
                borderBottom: `1px solid ${MC.borderSoft}`,
                transition: "background 0.1s",
              }}
              onMouseEnter={e => { if (o.value !== value) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={e => { if (o.value !== value) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface CreateSessionFormProps {
  onCreated: (sessionId: string) => void;
}

// No FONT_IMPORT any more (2026-08-22). DM Mono, Syne and Montserrat are all self-hosted in
// client/src/index.css — Syne was added there in this change, the other two were already bundled.
// Fetching them from Google made this form's headings paint in a fallback first and then snap.

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
      <style>{`
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
            Status: <span style={{ color: '#818cf8' }}>Ready</span>
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
const UI   = "'DM Sans', system-ui, -apple-system, sans-serif";

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

/* DM Sans is self-hosted in client/src/index.css (added 2026-08-22) — no Google Fonts request. */
const SESSION_CARDS_CSS = `
  /* ── isolation: block every inherited font/color from the journal shell ── */
  .obs-sessions-root {
    font-family: 'DM Sans', system-ui, -apple-system, sans-serif !important;
    font-size: 14px !important;
    color: #c9d1d9 !important;
    background: #0d1117 !important;
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
  const [tz, setTz] = useState('2');
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: async (data: { sessionName: string; startingBalance: number; brokerTimezone: number }) => {
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
    createMutation.mutate({ sessionName: name.trim().toUpperCase(), startingBalance: bal, brokerTimezone: parseInt(tz) });
  };

  return (
    <SCModal title="new session" onClose={onClose}>
      <SCField label="session name" value={name} onChange={(e) => setName(e.target.value)} placeholder="alpha-01" autoFocus />
      <SCField label="starting balance ($)" value={balance} onChange={(e) => setBalance(e.target.value)} type="number" placeholder="5000" />
      <SCSelect label="broker chart timezone" value={tz} onChange={setTz} />
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
  const [tz, setTz] = useState(String(session.brokerTimezone ?? 2));
  const [error, setError] = useState('');

  const updateMutation = useMutation({
    mutationFn: async (data: { sessionName: string; startingBalance: string; brokerTimezone: number }) => {
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
    updateMutation.mutate({ sessionName: name.trim().toUpperCase(), startingBalance: String(bal), brokerTimezone: parseInt(tz) });
  };

  return (
    <SCModal title="edit session" onClose={onClose}>
      <SCField label="session name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <SCField label="starting balance ($)" value={balance} onChange={(e) => setBalance(e.target.value)} type="number" />
      <SCSelect label="broker chart timezone" value={tz} onChange={setTz} />
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
// GRID FILL — the MINIMUM number of tiles drawn, so a near-empty page still looks
// like a grid rather than one lonely card. It is NOT a cap: `ghostsNeeded` below
// is `Math.max(1, …)`, so a create slot is appended however many sessions exist,
// and nothing on the server limits the count either.
//
// It was called TOTAL_SLOTS, which says the opposite of what it does. The user
// read the six tiles as a limit and asked for sessions to be "unlimited" — they
// already were; what he was seeing was the grid deforming past six (see the
// container comment below). A name that contradicts its own comment loses.
// ─────────────────────────────────────────────────────────────────────────────

const MIN_GRID_TILES = 6;

// ─────────────────────────────────────────────────────────────────────────────
// GHOST CARD — exact reference design
// ─────────────────────────────────────────────────────────────────────────────

function GhostCard({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      className="bg-[#0d1117] flex flex-col min-h-[320px] group hover:bg-[#111827] transition-colors cursor-pointer border-r border-b border-[#1e2740]"
      style={{ fontFamily: UI }}
      onClick={onCreate}
    >
      {/* Tab header */}
      <div className="flex justify-between items-center bg-[#111827]/60 px-3 py-2 border-b border-[#080d14]">
        <span className="text-[11px] text-[var(--jr-ink-dim)] font-medium">
          Untitled Session
        </span>
        <Plus size={12} className="text-[var(--jr-ink-dim)] group-hover:text-[var(--jr-ink-dim)]" />
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center space-y-3 opacity-30 group-hover:opacity-100 transition-opacity">
        <Terminal size={22} className="text-[var(--jr-ink-dim)]" />
        <p className="text-[11px] font-medium text-[var(--jr-ink-dim)]">New session slot</p>
      </div>

      {/* Footer */}
      <div className="p-4">
        <button
          className="w-full border border-dashed border-[#1e2740] group-hover:border-[#3b4fd8]/60 py-2 text-[11px] font-semibold text-[var(--jr-ink-dim)] group-hover:text-[#7c8cf8] transition-all"
          style={{ fontFamily: UI }}
        >+ Create Session</button>
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

  const pnlClass = !hasData ? 'text-[var(--jr-ink-dim)]' : pnlPos ? 'text-emerald-400' : 'text-red-400';

  const pnlVal = !hasData ? '—'
    : `${pnlPos ? '+' : '-'}$${Math.abs(totalPnL).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const retVal    = !hasData ? '—' : `${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}%`;
  const equityStr = hasData
    ? `$${equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${startBal.toLocaleString()}`;

  return (
    <div
      className="bg-[#0d1117] flex flex-col min-h-[320px] group cursor-pointer hover:bg-[#111827] transition-colors border-r border-b border-[#1e2740]"
      style={{ fontFamily: UI }}
      onClick={onSelect}
      data-testid={`card-session-${session.id}`}
    >
      {/* Header bar */}
      <div className="flex justify-between items-center bg-[#111827] border-b border-[#080d14] px-3 py-2">
        <div className="flex items-center gap-2 overflow-hidden">
          {isActive
            ? <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] shrink-0" />
            : <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${hasData ? 'bg-amber-400 opacity-60' : 'bg-[#374151]'}`} />
          }
          {/* #60a5fa is the app's dark-theme accent (JournalHeader: "the same accent the Assets
              page uses"), not a blue invented here. 6.98:1 on this header's #111827 — the title is
              12px, i.e. normal-size text, so the bar is 4.5:1 and #3b82f6 at 4.82:1 was too close
              to it. This subtree is dark-only (.obs-sessions-root pins its own palette), so unlike
              the header it needs no second light-theme blue. */}
          <span
            className="text-[12px] font-semibold text-[#60a5fa] truncate"
            data-testid={`text-session-name-${session.id}`}
          >{session.sessionName}</span>
        </div>
        <MoreVertical size={14} className="text-[var(--jr-ink-dim)] hover:text-[#c9d1d9] cursor-pointer shrink-0" />
      </div>

      {/* Body */}
      <div className="p-5 flex-1 flex flex-col">

        {/* Equity */}
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-0.5">
            <p className="text-[10px] font-medium text-[var(--jr-ink-dim)]">Current Equity</p>
            <h2 className="text-[11px] font-bold text-[#f0f6fc]">{equityStr}</h2>
          </div>
          <ArrowUpRight
            size={18}
            className={`${pnlPos || !hasData ? 'text-emerald-500' : 'text-red-400'} opacity-40 mt-1`}
          />
        </div>

        {/* Stat rows */}
        <div className="space-y-3 flex-1">
          <div className="flex justify-between items-center text-[11px] border-b border-[#1a2035] pb-2.5">
            <span className="text-[var(--jr-ink-dim)]">Net P&L</span>
            <span className={`${pnlClass} font-semibold`}>{pnlVal}</span>
          </div>
          <div className="flex justify-between items-center text-[11px] border-b border-[#1a2035] pb-2.5">
            <span className="text-[var(--jr-ink-dim)]">Total Return</span>
            <span className="text-[#818cf8] font-semibold">{retVal}</span>
          </div>
          <div className="flex justify-between items-center text-[11px] border-b border-[#1a2035] pb-2.5">
            <span className="text-[var(--jr-ink-dim)]">Trades</span>
            <span className="text-[#c9d1d9] font-semibold">{tradeCount}</span>
          </div>
        </div>

        {/* Actions */}
        <div
          className="mt-5 flex gap-2"
          onClick={e => e.stopPropagation()}
        >
          <button
            className="flex-1 bg-[#111827] hover:bg-[#1a2035] border border-[#1e2740] text-[#c9d1d9] text-[11px] font-semibold py-2 transition-colors rounded-sm"
            onClick={onEdit}
          >Edit Session</button>
          <button
            className="px-3 bg-[#111827] hover:bg-red-900/20 border border-[#1e2740] text-[var(--jr-ink-dim)] hover:text-red-400 transition-colors rounded-sm flex items-center"
            onClick={onDelete}
            data-testid={`button-delete-session-${session.id}`}
          >
            <Trash2 size={13} />
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
      {/* SEPARATORS COME FROM THE TILES, NOT FROM THIS CONTAINER.
          It used to fake the grid lines with `gap-[1px] bg-[#1e2740]` — the container's background
          showing through 1px gaps. That only works while the last row is FULL: any leftover cell
          has no tile over it, so the background rendered as a SOLID PALE BLOCK the size of a card.
          At the default 6 tiles it never showed (6 divides by 1, 2 and 3, so the last row was
          always full); at 7 sessions on a wide screen, or 6 on a medium one, it appeared — which is
          why it read as "past a certain number everything deforms", and why the number moved with
          the window width. Each tile now draws its own right/bottom edge, so a part-filled row is
          simply fewer bordered tiles. */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border-t border-l border-[#1e2740]">
        {Array.from({ length: MIN_GRID_TILES }).map((_, i) => (
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
  const { data: allSessions = [], isLoading } = useQuery<SessionData[]>({
    queryKey: ['/api/sessions'],
    staleTime: 0,
  });
  // Each broker account auto-creates a backing session. Hide those *here* (the manual-session
  // grid) so they aren't a duplicate of the Accounts page. The `brokerBacked` flag is computed
  // SERVER-SIDE on /api/sessions, so this never depends on a separate broker-accounts query
  // being loaded/fresh (that race let broker accounts leak into the create page). The rows
  // still come back from /api/sessions so the per-account dashboard keeps resolving.
  const sessions = allSessions.filter((s) => !s.brokerBacked);
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

  // Always keep at least one "+ Create Session" slot so there's no cap — below
  // MIN_GRID_TILES we fill the grid up to 6; at/above it we still show one create slot.
  const ghostsNeeded = Math.max(1, MIN_GRID_TILES - sessions.length);

  return (
    <div className="obs-sessions-root">
      <style>{SESSION_CARDS_CSS}</style>

      {/* SEPARATORS COME FROM THE TILES, NOT FROM THIS CONTAINER.
          It used to fake the grid lines with `gap-[1px] bg-[#1e2740]` — the container's background
          showing through 1px gaps. That only works while the last row is FULL: any leftover cell
          has no tile over it, so the background rendered as a SOLID PALE BLOCK the size of a card.
          At the default 6 tiles it never showed (6 divides by 1, 2 and 3, so the last row was
          always full); at 7 sessions on a wide screen, or 6 on a medium one, it appeared — which is
          why it read as "past a certain number everything deforms", and why the number moved with
          the window width. Each tile now draws its own right/bottom edge, so a part-filled row is
          simply fewer bordered tiles. */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border-t border-l border-[#1e2740]">
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
