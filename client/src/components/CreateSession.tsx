import { useState, useEffect, useRef } from 'react';
import { Globe, PlusCircle, Wallet, Clock, ChevronRight } from 'lucide-react';
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
        .csf-root { font-family: 'DM Mono', monospace; }
        .csf-input { width: 100%; box-sizing: border-box; }
        .csf-input:focus { outline: none; border-color: rgba(99,102,241,0.6) !important; background: rgba(99,102,241,0.05) !important; }
        .csf-deploy:not(:disabled):hover { background: #5254cc !important; }
        .csf-deploy:not(:disabled):active { transform: translateY(1px); }
      `}</style>
      <div className="csf-root" style={{ width: '100%', maxWidth: 460, margin: '0 auto', paddingBottom: 8 }}>

        {/* Icon + title */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, background: '#4f46e5',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16,
          }}>
            <PlusCircle size={26} color="#fff" strokeWidth={1.5} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '0.12em', color: '#ffffff', textTransform: 'uppercase', marginBottom: 6, fontFamily: "'Syne', sans-serif" }}>
            Create New Session
          </div>
          <div style={{ fontSize: 9, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>
            System Initialisation Required
          </div>
        </div>

        {/* Form card */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="form-create-session">

          {/* Session identifier */}
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
                fontFamily: "'DM Mono', monospace",
                letterSpacing: '0.06em',
                transition: 'border-color 0.2s, background 0.2s',
              }}
            />
          </div>

          {/* Initial liquidity */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>
              <Wallet size={9} style={{ color: 'rgba(255,255,255,0.35)' }} />
              Initial Liquidity
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                color: 'rgba(255,255,255,0.5)', fontFamily: "'DM Mono', monospace", fontSize: 13,
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
                  fontFamily: "'DM Mono', monospace",
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

          {/* Deploy button */}
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
              fontFamily: "'DM Mono', monospace",
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

        {/* Status bar */}
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

  const pnlColor = !hasData ? 'rgba(232,230,224,0.25)' : pnlPositive ? '#1D9E75' : '#ff5e5e';
  const retColor = !hasData ? 'rgba(232,230,224,0.25)' : pnlPositive ? '#1D9E75' : '#ff5e5e';
  const tradesColor = tradeCount > 0 ? '#1D9E75' : 'rgba(232,230,224,0.25)';

  const cardBorder = isWinner
    ? (hov ? 'rgba(29,158,117,0.5)' : 'rgba(29,158,117,0.3)')
    : (hov ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.07)');

  return (
    <div
      onClick={isEditing ? undefined : onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      data-testid={`card-session-${session.id}`}
      style={{
        background: '#111113',
        border: `1px solid ${cardBorder}`,
        borderRadius: 0,
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color 0.2s, transform 0.2s, opacity 0.4s',
        transform: visible ? (hov && !isActive ? 'translateY(-2px)' : 'translateY(0)') : 'translateY(20px)',
        opacity: visible ? 1 : 0,
        fontFamily: "'DM Mono', monospace",
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
                    flex: 1, fontFamily: "'DM Mono', monospace", letterSpacing: '0.04em',
                    textTransform: 'uppercase', padding: '2px 0', minWidth: 0,
                  }}
                />
                <button onMouseDown={e => { e.preventDefault(); commitNameEdit(); }}
                  style={{ background: 'none', border: '1px solid rgba(29,158,117,0.5)', color: '#1D9E75', fontSize: 9, padding: '2px 7px', cursor: 'pointer', fontFamily: "'DM Mono', monospace", flexShrink: 0, borderRadius: 4 }}>✓</button>
                <button onMouseDown={e => { e.preventDefault(); cancelNameEdit(); }}
                  style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(232,230,224,0.4)', fontSize: 9, padding: '2px 7px', cursor: 'pointer', fontFamily: "'DM Mono', monospace", flexShrink: 0, borderRadius: 4 }}>✗</button>
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
            <div style={{ fontSize: 10, letterSpacing: '0.06em', color: 'rgba(232,230,224,0.3)', marginTop: 3 }}>
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

        <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', marginBottom: '1rem' }} />

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(232,230,224,0.3)', marginBottom: 4 }}>
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
                  flex: 1, fontFamily: "'DM Mono', monospace", letterSpacing: '-0.01em', padding: '2px 0',
                }}
              />
              <button onMouseDown={e => { e.preventDefault(); commitEdit(); }}
                style={{ background: 'none', border: '1px solid rgba(29,158,117,0.5)', color: '#1D9E75', fontSize: 9, padding: '3px 8px', cursor: 'pointer', fontFamily: "'DM Mono', monospace", flexShrink: 0, borderRadius: 4 }}>✓</button>
              <button onMouseDown={e => { e.preventDefault(); cancelEdit(); }}
                style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(232,230,224,0.4)', fontSize: 9, padding: '3px 8px', cursor: 'pointer', fontFamily: "'DM Mono', monospace", flexShrink: 0, borderRadius: 4 }}>✗</button>
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
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: 0,
              padding: '8px 10px',
            }}>
              <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(232,230,224,0.3)', marginBottom: 5 }}>
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
        borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>
        <span style={{
          fontSize: 10, letterSpacing: '0.05em',
          color: hasData ? 'rgba(29,158,117,0.6)' : 'rgba(232,230,224,0.2)',
        }}>
          {tradeCount === 0 ? 'No trades yet' : `${tradeCount} trade${tradeCount === 1 ? '' : 's'} logged`}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={startNameEdit}
            onMouseEnter={() => setEditHov(true)}
            onMouseLeave={() => setEditHov(false)}
            style={{
              fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.08em',
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
              fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.08em',
              padding: '4px 12px', borderRadius: 5, cursor: 'pointer', transition: 'all 0.15s',
              border: `1px solid ${deleteHov ? 'rgba(255,80,80,0.4)' : 'rgba(255,255,255,0.1)'}`,
              background: deleteHov ? 'rgba(255,80,80,0.08)' : 'transparent',
              color: deleteHov ? '#ff5e5e' : 'rgba(232,230,224,0.35)',
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
}

export const SessionsList = ({ onSelectSession, activeSessionId, onDeleteSession }: SessionsListProps) => {
  const { data: sessions = [], isLoading } = useQuery<SessionData[]>({
    queryKey: ['/api/sessions'],
  });
  const headerVis = useVisible(40);

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
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Loading sessions...</span>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 16 }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(29,158,117,0.06)', border: '1px solid rgba(29,158,117,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Globe size={28} style={{ color: 'rgba(29,158,117,0.4)' }} />
        </div>
        <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, color: '#f0ede6' }} data-testid="text-no-sessions">No Sessions Yet</span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(232,230,224,0.28)', letterSpacing: '0.04em', textAlign: 'center' }}>Create your first trading session to start tracking your performance</span>
      </div>
    );
  }

  return (
    <>
      <style>{FONT_IMPORT}{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .sessions-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
        @media (max-width: 700px) { .sessions-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 480px) { .sessions-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div style={{ position: 'relative', fontFamily: "'DM Mono', monospace" }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 16,
          opacity: headerVis ? 1 : 0,
          transform: headerVis ? 'translateY(0)' : 'translateY(-10px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
        }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.2em', color: '#1D9E75', textTransform: 'uppercase', marginBottom: 4 }}>
              Trading Sessions
            </div>
          </div>
          <span style={{
            fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: '#5DCAA5', border: '1px solid rgba(29,158,117,0.2)',
            padding: '5px 14px', borderRadius: 20, background: 'rgba(29,158,117,0.08)',
          }}>
            {sessions.length} {sessions.length === 1 ? 'Session' : 'Sessions'}
          </span>
        </div>

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
        </div>
      </div>
    </>
  );
};
