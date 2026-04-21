import { useState, useEffect, useRef } from 'react';
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
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=Syne:wght@400;500;600;700;800&display=swap');
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
// GHOST CARD SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

const GH = {
  bg: "#0D0F1C",
  surface: "#121526",
  surfaceDeep: "#0D0F1C",
  border: "#1E2240",
  green: "#ffffff",
  greenDim: "rgba(255,255,255,0.06)",
  greenBorder: "rgba(255,255,255,0.2)",
  textPrimary: "#D8DCF0",
  textMuted: "#6A7299",
  red: "#e05555",
};

function GhostActionBtn({ children, onClick, color }: { children: React.ReactNode; onClick: () => void; color: string }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        fontSize: '10px', letterSpacing: '0.08em',
        padding: '6px 14px', cursor: 'pointer',
        border: `1px solid ${color}`, background: 'transparent',
        color, opacity: hov ? 0.65 : 1, transition: 'opacity 0.15s',
      }}
    >
      {children}
    </button>
  );
}

function GhostModal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 300,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: GH.surface, border: `1px solid ${GH.border}`, padding: '32px', width: '380px' }}
      >
        {children}
      </div>
    </div>
  );
}

function GhostField({ label, value, onChange, type = 'text', placeholder, autoFocus }: {
  label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string; placeholder?: string; autoFocus?: boolean;
}) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ display: 'block', fontSize: '9px', letterSpacing: '0.18em', color: GH.textMuted, textTransform: 'uppercase', marginBottom: '6px' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{
          width: '100%', background: '#080808', border: `1px solid ${GH.border}`,
          padding: '10px 12px', color: GH.textPrimary,
          fontSize: '13px', letterSpacing: '0.04em', boxSizing: 'border-box',
          outline: 'none',
        }}
      />
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
    <GhostModal onClose={onClose}>
      <div style={{ fontSize: '11px', letterSpacing: '0.2em', color: GH.green, textTransform: 'uppercase', marginBottom: '24px' }}>
        New Session
      </div>
      <GhostField label="Session Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ALPHA-01" autoFocus />
      <GhostField label="Starting Balance ($)" value={balance} onChange={(e) => setBalance(e.target.value)} type="number" placeholder="5000" />
      {error && (
        <div style={{ fontSize: '10px', color: GH.red, marginBottom: '12px' }}>{error}</div>
      )}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
        <GhostActionBtn color="#333" onClick={onClose}>Cancel</GhostActionBtn>
        <GhostActionBtn color={GH.green} onClick={submit}>
          {createMutation.isPending ? '...' : 'Create'}
        </GhostActionBtn>
      </div>
    </GhostModal>
  );
}

function GhostCard({ opacity, onCreate }: { opacity: number; onCreate: () => void }) {
  const dim = '#4A5080';
  const dimDeep = '#2A2E50';

  return (
    <div
      style={{
        background: '#121526',
        border: `1px solid ${GH.border}`,
        borderRadius: 0,
        opacity,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        minHeight: 250,
      }}
    >
      <div style={{ padding: '1.25rem 1.25rem 0', flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.1rem' }}>
          <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: dim }}>
              — — —
            </div>
            <div style={{ fontSize: 10, letterSpacing: '0.06em', color: dimDeep, marginTop: 3 }}>
              — — —
            </div>
          </div>
          <span style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: dim, border: `1px solid ${GH.border}`,
            padding: '3px 10px', borderRadius: 20, background: 'transparent',
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: dimDeep, display: 'inline-block' }} />
            inactive
          </span>
        </div>

        <div style={{ height: 1, background: GH.border, marginBottom: '1rem' }} />

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: dimDeep, marginBottom: 4 }}>
            Starting balance
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: dim, letterSpacing: '-0.02em' }}>
            $ — —
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: '1.1rem' }}>
          {['P&L', 'Return', 'Trades'].map((label) => (
            <div key={label} style={{
              background: 'rgba(18,21,38,0.6)',
              border: `1px solid ${GH.border}`,
              borderRadius: 0,
              padding: '8px 10px',
            }}>
              <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: dimDeep, marginBottom: 5 }}>
                {label}
              </div>
              <div style={{ fontSize: 11, fontWeight: 500, color: dimDeep, letterSpacing: '0.02em' }}>
                —
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 1.25rem',
        borderTop: `1px solid ${GH.border}`,
        marginTop: 'auto',
      }}>
        <span style={{ fontSize: 10, letterSpacing: '0.05em', color: dimDeep }}>
          no session yet
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <GhostActionBtn color={GH.green} onClick={onCreate}>create</GhostActionBtn>
          <GhostActionBtn color="#2a2a2a" onClick={() => {}}>delete</GhostActionBtn>
        </div>
      </div>
    </div>
  );
}

const GHOST_CSS = `
  @keyframes ghost-blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
`;

const GHOST_OPACITIES = [0.9, 0.7, 0.5, 0.35, 0.22];
const TOTAL_SLOTS = 6;

export function GhostSessionsPanel({ onCreated }: { onCreated?: (id: string) => void }) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div style={{ padding: '28px 32px' }}>
      <style>{GHOST_CSS}</style>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
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
// SESSION CARD (existing sessions)
// ─────────────────────────────────────────────────────────────────────────────

const SessionCard = ({ session, isActive, onSelect, onDelete, index }: {
  session: SessionData;
  isActive: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  index: number;
}) => {
  const [hov, setHov] = useState(false);
  const [deleteHov, setDeleteHov] = useState(false);
  const [editHov, setEditHov] = useState(false);

  const [editingBal, setEditingBal] = useState(false);
  const [balInput, setBalInput] = useState('');
  const [balSaved, setBalSaved] = useState(false);
  const balInputRef = useRef<HTMLInputElement>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameSaved, setNameSaved] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const visible = useVisible(index * 80 + 60);
  const pulse = usePulse();
  const { totalPnL, tradeCount, isLoading: balLoading } = useSessionBalance(session.id);
  const startBal = parseFloat(session.startingBalance) || 0;
  const hasData = !balLoading && tradeCount > 0;
  const pnlPositive = totalPnL >= 0;
  const returnPct = startBal > 0 ? (totalPnL / startBal) * 100 : 0;
  const dateStr = session.createdAt
    ? new Date(session.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  const updateBalMutation = useMutation({
    mutationFn: (newBal: number) =>
      apiRequest('PUT', `/api/sessions/${session.id}`, { startingBalance: String(newBal) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      setBalSaved(true);
      setTimeout(() => setBalSaved(false), 1500);
    },
  });

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setBalInput(String(startBal));
    setEditingBal(true);
    setBalSaved(false);
    setTimeout(() => balInputRef.current?.select(), 0);
  };
  const commitEdit = () => {
    const parsed = parseFloat(balInput.replace(/[^0-9.]/g, ''));
    if (!isNaN(parsed) && parsed > 0 && parsed !== startBal) updateBalMutation.mutate(parsed);
    setEditingBal(false);
  };
  const cancelEdit = () => setEditingBal(false);
  const handleBalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
    e.stopPropagation();
  };

  const updateNameMutation = useMutation({
    mutationFn: (newName: string) =>
      apiRequest('PUT', `/api/sessions/${session.id}`, { sessionName: newName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 1500);
    },
  });

  const startNameEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNameInput(session.sessionName);
    setEditingName(true);
    setNameSaved(false);
    setTimeout(() => nameInputRef.current?.select(), 0);
  };
  const commitNameEdit = () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== session.sessionName) updateNameMutation.mutate(trimmed);
    setEditingName(false);
  };
  const cancelNameEdit = () => setEditingName(false);
  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commitNameEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelNameEdit(); }
    e.stopPropagation();
  };

  const isEditing = editingBal || editingName;
  const isWinner = hasData;

  const pnlColor = !hasData ? '#3A3F60' : pnlPositive ? '#1D9E75' : '#ff5e5e';
  const retColor = !hasData ? '#3A3F60' : pnlPositive ? '#1D9E75' : '#ff5e5e';
  const tradesColor = tradeCount > 0 ? '#1D9E75' : '#3A3F60';

  const cardBorder = isWinner
    ? (hov ? 'rgba(29,158,117,0.5)' : 'rgba(29,158,117,0.3)')
    : (hov ? '#252848' : '#1E2240');

  return (
    <div
      onClick={isEditing ? undefined : onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      data-testid={`card-session-${session.id}`}
      style={{
        background: '#121526',
        border: `1px solid ${cardBorder}`,
        borderRadius: 0,
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color 0.2s, transform 0.2s, opacity 0.4s',
        transform: visible ? (hov && !isActive ? 'translateY(-2px)' : 'translateY(0)') : 'translateY(20px)',
        opacity: visible ? 1 : 0,
      }}
    >
      {isWinner && (
        <>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #1a6ef5, #5aadff)', zIndex: 1 }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(29,158,117,0.06) 0%, transparent 60%)', pointerEvents: 'none' }} />
        </>
      )}

      <div style={{ padding: '1.25rem 1.25rem 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.1rem' }}>
          <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
            {editingName ? (
              <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  ref={nameInputRef}
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={handleNameKeyDown}
                  data-testid={`input-session-name-${session.id}`}
                  style={{
                    fontSize: 11, fontWeight: 700, color: '#f0ede6', background: 'transparent',
                    border: 'none', borderBottom: '1px solid rgba(29,158,117,0.6)', outline: 'none',
                    flex: 1, letterSpacing: '0.04em',
                    textTransform: 'uppercase', padding: '2px 0', minWidth: 0,
                  }}
                />
                <button onMouseDown={e => { e.preventDefault(); commitNameEdit(); }}
                  style={{ background: 'none', border: '1px solid rgba(29,158,117,0.5)', color: '#1D9E75', fontSize: 9, padding: '2px 7px', cursor: 'pointer', flexShrink: 0, borderRadius: 4 }}>✓</button>
                <button onMouseDown={e => { e.preventDefault(); cancelNameEdit(); }}
                  style={{ background: 'none', border: '1px solid #252848', color: '#6A7299', fontSize: 9, padding: '2px 7px', cursor: 'pointer', flexShrink: 0, borderRadius: 4 }}>✗</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <div
                  data-testid={`text-session-name-${session.id}`}
                  style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.02em', color: '#f0ede6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {session.sessionName}
                </div>
                <span
                  onClick={startNameEdit}
                  style={{ cursor: 'pointer', color: 'rgba(29,158,117,0.6)', fontSize: 8, letterSpacing: '0.1em', flexShrink: 0, transition: 'color 0.15s' }}
                  title="Edit name"
                >✎</span>
                {nameSaved && <span style={{ color: '#1D9E75', fontSize: 8, letterSpacing: '0.1em' }}>saved</span>}
              </div>
            )}
            <div style={{ fontSize: 10, letterSpacing: '0.06em', color: '#6A7299', marginTop: 3 }}>
              {dateStr}
            </div>
          </div>

          {isActive ? (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
              fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: '#5DCAA5', border: '1px solid rgba(29,158,117,0.3)',
              padding: '3px 10px', borderRadius: 20, background: 'rgba(29,158,117,0.1)',
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: pulse ? '#1D9E75' : 'rgba(29,158,117,0.3)',
                boxShadow: pulse ? '0 0 6px rgba(29,158,117,0.9)' : 'none',
                transition: 'all 0.6s ease', flexShrink: 0,
              }} />
              active
            </span>
          ) : (
            <span style={{
              flexShrink: 0, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: '#5DCAA5', border: '1px solid rgba(29,158,117,0.2)',
              padding: '3px 10px', borderRadius: 20, background: 'rgba(29,158,117,0.1)',
            }}>
              {session.status?.toLowerCase() || 'active'}
            </span>
          )}
        </div>

        <div style={{ height: 1, background: '#1E2240', marginBottom: '1rem' }} />

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#6A7299', marginBottom: 4 }}>
            Starting balance
          </div>
          {editingBal ? (
            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                ref={balInputRef}
                value={balInput}
                onChange={e => setBalInput(e.target.value)}
                onKeyDown={handleBalKeyDown}
                style={{
                  fontSize: 13, fontWeight: 700, color: '#f0ede6', background: 'transparent',
                  border: 'none', borderBottom: '1px solid rgba(29,158,117,0.6)', outline: 'none',
                  flex: 1, letterSpacing: '-0.01em', padding: '2px 0',
                }}
              />
              <button onMouseDown={e => { e.preventDefault(); commitEdit(); }}
                style={{ background: 'none', border: '1px solid rgba(29,158,117,0.5)', color: '#1D9E75', fontSize: 9, padding: '3px 8px', cursor: 'pointer', flexShrink: 0, borderRadius: 4 }}>✓</button>
              <button onMouseDown={e => { e.preventDefault(); cancelEdit(); }}
                style={{ background: 'none', border: '1px solid #252848', color: '#6A7299', fontSize: 9, padding: '3px 8px', cursor: 'pointer', flexShrink: 0, borderRadius: 4 }}>✗</button>
            </div>
          ) : (
            <div
              onClick={startEdit}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f0ede6', letterSpacing: '-0.02em', cursor: 'text' }}>
                ${startBal.toLocaleString()}
              </div>
              {balSaved && <span style={{ color: '#1D9E75', fontSize: 8, letterSpacing: '0.1em' }}>saved</span>}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: '1.1rem' }}>
          {[
            {
              label: 'P&L',
              value: !hasData ? '—' : `${totalPnL < 0 ? '' : '+'}$${Math.abs(totalPnL).toFixed(2)}`,
              color: pnlColor,
            },
            {
              label: 'Return',
              value: !hasData ? '—' : `${returnPct < 0 ? '' : '+'}${returnPct.toFixed(1)}%`,
              color: retColor,
            },
            {
              label: 'Trades',
              value: balLoading ? '—' : String(tradeCount),
              color: tradesColor,
            },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: 'rgba(18,21,38,0.6)',
              border: '1px solid #1E2240',
              borderRadius: 0,
              padding: '8px 10px',
            }}>
              <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6A7299', marginBottom: 5 }}>
                {label}
              </div>
              <div style={{ fontSize: 11, fontWeight: 500, color, letterSpacing: '0.02em' }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 1.25rem',
        borderTop: '1px solid #1E2240',
      }}>
        <span style={{
          fontSize: 10, letterSpacing: '0.05em',
          color: hasData ? 'rgba(29,158,117,0.6)' : '#3A3F60',
        }}>
          {tradeCount === 0 ? 'No trades yet' : `${tradeCount} trade${tradeCount === 1 ? '' : 's'} logged`}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={startNameEdit}
            onMouseEnter={() => setEditHov(true)}
            onMouseLeave={() => setEditHov(false)}
            style={{
              fontSize: 10, letterSpacing: '0.08em',
              padding: '4px 12px', borderRadius: 5, cursor: 'pointer', transition: 'all 0.15s',
              border: `1px solid ${editHov ? 'rgba(29,158,117,0.5)' : 'rgba(29,158,117,0.25)'}`,
              background: editHov ? 'rgba(29,158,117,0.1)' : 'transparent',
              color: editHov ? '#1D9E75' : 'rgba(29,158,117,0.7)',
            }}
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            data-testid={`button-delete-session-${session.id}`}
            onMouseEnter={() => setDeleteHov(true)}
            onMouseLeave={() => setDeleteHov(false)}
            style={{
              fontSize: 10, letterSpacing: '0.08em',
              padding: '4px 12px', borderRadius: 5, cursor: 'pointer', transition: 'all 0.15s',
              border: `1px solid ${deleteHov ? 'rgba(255,80,80,0.4)' : '#1E2240'}`,
              background: deleteHov ? 'rgba(255,80,80,0.08)' : 'transparent',
              color: deleteHov ? '#ff5e5e' : '#6A7299',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

interface SessionsListProps {
  onSelectSession: (sessionId: string) => void;
  activeSessionId: string | null;
  onDeleteSession?: (sessionId: string) => void;
  onCreated?: (sessionId: string) => void;
}

export const SessionsList = ({ onSelectSession, activeSessionId, onDeleteSession, onCreated }: SessionsListProps) => {
  const { data: sessions = [], isLoading } = useQuery<SessionData[]>({
    queryKey: ['/api/sessions'],
  });
  const [showCreate, setShowCreate] = useState(false);

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
      if (onDeleteSession) onDeleteSession(deletedId);
    },
  });

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
        <span style={{ fontSize: 10, color: '#6A7299', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Loading sessions...</span>
      </div>
    );
  }

  const ghostsNeeded = Math.max(0, TOTAL_SLOTS - sessions.length);
  const ghosts = GHOST_OPACITIES.slice(0, ghostsNeeded);

  if (sessions.length === 0) {
    return (
      <div style={{ padding: '28px 8px' }}>
        <style>{GHOST_CSS}</style>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
          {ghosts.map((op, i) => (
            <GhostCard key={i} opacity={op} onCreate={() => setShowCreate(true)} />
          ))}
        </div>

        {showCreate && (
          <GhostCreateModal
            onClose={() => setShowCreate(false)}
            onCreated={(id) => { setShowCreate(false); onCreated?.(id); queryClient.invalidateQueries({ queryKey: ['/api/sessions'] }); }}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <style>{FONT_IMPORT}{GHOST_CSS}{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .sessions-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
        @media (max-width: 700px) { .sessions-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 480px) { .sessions-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div style={{ position: 'relative' }}>
        <div className="sessions-grid">
          {sessions.map((session, i) => (
            <SessionCard
              key={session.id}
              session={session}
              isActive={activeSessionId === session.id}
              onSelect={() => onSelectSession(session.id)}
              onDelete={(e) => { e.stopPropagation(); deleteMutation.mutate(session.id); }}
              index={i}
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
    </>
  );
};
