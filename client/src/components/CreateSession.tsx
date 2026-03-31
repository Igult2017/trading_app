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

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14H6L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4h6v2"/>
  </svg>
);

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

export const CreateSessionForm = ({ onCreated }: CreateSessionFormProps) => {
  const [sessionName, setSessionName] = useState('');
  const [startingBalance, setStartingBalance] = useState('');
  const [formError, setFormError] = useState('');

  const createMutation = useMutation({
    mutationFn: async (data: { sessionName: string; startingBalance: number }) => {
      const res = await apiRequest("POST", "/api/sessions", data);
      // ✅ FIX: Check for non-2xx responses and surface the server error message
      // instead of silently failing. Previously res.json() was called blindly
      // even on 400 responses, causing the onSuccess to never fire with no
      // visible error shown to the user.
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
      // ✅ FIX: Surface the error in the UI so the user knows what went wrong
      setFormError(error.message || 'Failed to create session. Please try again.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    // ✅ FIX: Validate before sending — previously `|| 0` silently submitted
    // 0 as the balance when the field was empty or non-numeric, which then
    // failed Zod validation on the server with no visible feedback.
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
    <div className="w-full max-w-xl mx-auto" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <div className="bg-[#0c111b]/40 backdrop-blur-2xl p-6 md:p-10 shadow-2xl">

        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 bg-indigo-600 flex items-center justify-center text-white mb-4 shadow-[4px_4px_0px_rgba(79,70,229,0.3)]">
            <PlusCircle size={28} />
          </div>
          <h2
            className="text-2xl font-black text-white tracking-tighter mb-1 uppercase"
            data-testid="text-create-session-title"
          >
            Create New Session
          </h2>
          <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-widest">
            System Initialisation Required
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6" data-testid="form-create-session">
          <div className="group">
            <label className="flex items-center gap-2 text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 ml-1">
              <Clock size={10} className="text-indigo-500" />
              Session Identifier
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="E.G. NASDAQ_SCALP_01"
                className="w-full bg-slate-900/80 border-0 rounded-none py-4 px-6 text-white font-bold placeholder:text-slate-700 focus:outline-none focus:bg-slate-800 transition-all duration-200"
                data-testid="input-session-name"
              />
              <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-indigo-500 group-focus-within:w-full transition-all duration-500" />
            </div>
          </div>

          <div className="group">
            <label className="flex items-center gap-2 text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 ml-1">
              <Wallet size={10} className="text-indigo-500" />
              Initial Liquidity
            </label>
            <div className="relative">
              <div className="absolute left-6 top-1/2 -translate-y-1/2 text-indigo-500 font-black text-xl">$</div>
              <input
                type="number"
                value={startingBalance}
                onChange={(e) => setStartingBalance(e.target.value)}
                placeholder="10000"
                min="0"
                step="0.01"
                className="w-full bg-slate-900/80 border-0 rounded-none py-4 pl-12 pr-6 text-white font-black text-xl focus:outline-none focus:bg-slate-800 transition-all duration-200"
                data-testid="input-starting-balance"
              />
              <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-indigo-500 group-focus-within:w-full transition-all duration-500" />
            </div>
          </div>

          {formError && (
            <div className="bg-red-500/10 border-l-2 border-red-500 px-4 py-3">
              <p className="text-xs font-semibold text-red-400" data-testid="text-form-error">{formError}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={createMutation.isPending}
            className={`w-full relative mt-2 py-5 font-black text-white transition-all duration-200 flex items-center justify-center gap-3 tracking-[0.15em] uppercase text-xs ${
              createMutation.isPending
                ? 'bg-indigo-900'
                : 'bg-indigo-600 hover:bg-indigo-500 active:translate-y-1 shadow-[0_6px_0_rgb(49,46,129)] hover:shadow-[0_3px_0_rgb(49,46,129)] active:shadow-none'
            }`}
            data-testid="button-create-session"
          >
            {createMutation.isPending ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Deploy Session
                <ChevronRight size={18} strokeWidth={3} />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-white/5 flex flex-col items-center gap-2">
          <div className="text-[9px] font-bold text-slate-600 tracking-[0.3em] uppercase">Status: Ready</div>
          <div className="h-1 w-16 bg-slate-800 relative overflow-hidden">
            <div className="absolute inset-0 bg-indigo-500/50 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
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
  const [editingBal, setEditingBal] = useState(false);
  const [balInput, setBalInput] = useState('');
  const balInputRef = useRef<HTMLInputElement>(null);
  const visible = useVisible(index * 80 + 120);
  const pulse = usePulse();
  const { totalPnL, tradeCount, isLoading: balLoading } = useSessionBalance(session.id);
  const startBal = parseFloat(session.startingBalance) || 0;
  const hasData = !balLoading && tradeCount > 0;
  const pnlPositive = totalPnL >= 0;
  const returnPct = startBal > 0 ? (totalPnL / startBal) * 100 : 0;
  const dateStr = session.createdAt ? new Date(session.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

  const [balSaved, setBalSaved] = useState(false);

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

  const pnlColor = !hasData ? '#555' : totalPnL === 0 ? '#555' : pnlPositive ? '#3dff8f' : '#ff4d4d';
  const retColor = !hasData ? '#555' : returnPct === 0 ? '#555' : pnlPositive ? '#3dff8f' : '#ff4d4d';

  return (
    <div
      onClick={editingBal ? undefined : onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      data-testid={`card-session-${session.id}`}
      style={{
        background: '#080c10',
        border: `2px solid ${isActive ? '#2a2a2a' : hov ? '#2a2a2a' : '#1a1a1a'}`,
        cursor: 'pointer',
        position: 'relative',
        transition: 'border-color 0.15s, transform 0.1s',
        overflow: 'hidden',
        transform: visible ? (hov && !isActive ? 'translateY(-2px)' : 'translateY(0)') : 'translateY(24px)',
        opacity: visible ? 1 : 0,
        fontFamily: "'Montserrat', sans-serif",
      }}
    >
      {/* Top accent line */}
      <div style={{ height: 3, background: hasData ? '#ff4d4d' : '#1e1e1e' }} />

      {/* Card top bar */}
      <div style={{
        background: '#0c1018',
        borderBottom: '2px solid #0f1923',
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div
            data-testid={`text-session-name-${session.id}`}
            style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7eb8f7' }}
          >
            {session.sessionName}
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: '#444', textTransform: 'uppercase' }}>
            {dateStr}
          </div>
        </div>
        {isActive ? (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: '#60a5fa', border: '1.5px solid #60a5fa', padding: '3px 8px',
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: pulse ? '#60a5fa' : 'rgba(96,165,250,0.3)',
              boxShadow: pulse ? '0 0 5px rgba(96,165,250,0.9)' : 'none',
              transition: 'all 0.6s ease', flexShrink: 0,
            }} />
            ACTIVE
          </span>
        ) : (
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: '#60a5fa', border: '1.5px solid #60a5fa', padding: '3px 8px',
          }}>
            {session.status?.toUpperCase() || 'ACTIVE'}
          </span>
        )}
      </div>

      {/* Card body */}
      <div style={{ padding: '10px 20px 0' }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', color: '#444', textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          Starting Balance
          {!editingBal && (
            <span onClick={startEdit} style={{ cursor: 'pointer', color: '#60a5fa', opacity: 0.7, fontSize: 8, letterSpacing: '0.1em' }} title="Edit balance">✎ EDIT</span>
          )}
          {balSaved && (
            <span style={{ color: '#3dff8f', fontSize: 8, letterSpacing: '0.1em' }}>✓ SAVED</span>
          )}
        </div>
        {editingBal ? (
          <div onClick={e => e.stopPropagation()} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                ref={balInputRef}
                value={balInput}
                onChange={e => setBalInput(e.target.value)}
                onKeyDown={handleBalKeyDown}
                style={{
                  fontSize: 18, fontWeight: 800, color: '#ffffff', background: 'transparent',
                  border: 'none', borderBottom: '2px solid #60a5fa', outline: 'none',
                  flex: 1, fontFamily: "'Montserrat', sans-serif", letterSpacing: '-0.01em',
                  padding: '2px 0',
                }}
              />
              <button
                onMouseDown={e => { e.preventDefault(); commitEdit(); }}
                style={{
                  background: 'none', border: '1.5px solid #3dff8f', color: '#3dff8f',
                  fontSize: 10, fontWeight: 700, padding: '3px 8px', cursor: 'pointer',
                  fontFamily: "'Montserrat', sans-serif", letterSpacing: '0.08em',
                  flexShrink: 0,
                }}
              >✓</button>
              <button
                onMouseDown={e => { e.preventDefault(); cancelEdit(); }}
                style={{
                  background: 'none', border: '1.5px solid #444', color: '#888',
                  fontSize: 10, fontWeight: 700, padding: '3px 8px', cursor: 'pointer',
                  fontFamily: "'Montserrat', sans-serif", letterSpacing: '0.08em',
                  flexShrink: 0,
                }}
              >✗</button>
            </div>
          </div>
        ) : (
          <div
            onClick={startEdit}
            style={{ fontSize: 19, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em', lineHeight: 1, marginBottom: 10, cursor: 'text' }}
          >
            ${startBal.toLocaleString()}
          </div>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: '2px solid #1a1a1a' }}>
        <div style={{ padding: '16px 20px', borderRight: '2px solid #1a1a1a' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: '#444', textTransform: 'uppercase', marginBottom: 6 }}>P&amp;L</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: pnlColor, letterSpacing: '-0.01em' }}>
            {!hasData ? '—' : `${totalPnL < 0 ? '' : '+'}${totalPnL.toFixed(2)}`}
          </div>
        </div>
        <div style={{ padding: '16px 20px', borderRight: '2px solid #1a1a1a' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: '#444', textTransform: 'uppercase', marginBottom: 6 }}>Return</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: retColor, letterSpacing: '-0.01em' }}>
            {!hasData ? '—' : `${returnPct < 0 ? '' : '+'}${returnPct.toFixed(1)}%`}
          </div>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: '#444', textTransform: 'uppercase', marginBottom: 6 }}>Trades</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: tradeCount > 0 ? '#7eb8f7' : '#555', letterSpacing: '-0.01em' }}>
            {balLoading ? '—' : tradeCount}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderTop: '2px solid #0f1923', background: '#0c1018',
      }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: '#3a3a3a', textTransform: 'uppercase' }}>
          {tradeCount === 0 ? 'No trades yet' : `${tradeCount} trade${tradeCount === 1 ? '' : 's'} logged`}
        </span>
        <button
          onClick={onDelete}
          data-testid={`button-delete-session-${session.id}`}
          onMouseEnter={() => setDeleteHov(true)}
          onMouseLeave={() => setDeleteHov(false)}
          style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: deleteHov ? '#ff4d4d' : '#3a3a3a',
            background: 'none',
            border: `1.5px solid ${deleteHov ? '#ff4d4d' : '#2a2a2a'}`,
            padding: '5px 12px', cursor: 'pointer',
            fontFamily: "'Montserrat', sans-serif",
            transition: 'border-color 0.15s, color 0.15s',
          }}
        >
          Delete
        </button>
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
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Loading sessions...</span>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 16 }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(99,210,170,0.06)', border: '1px solid rgba(99,210,170,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Globe size={28} style={{ color: 'rgba(99,210,170,0.4)' }} />
        </div>
        <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14, color: '#e2eaf5' }} data-testid="text-no-sessions">No Sessions Yet</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.04em' }}>Create your first trading session to start tracking your performance</span>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .sessions-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; }
        @media (max-width: 700px) { .sessions-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 480px) { .sessions-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div style={{ position: 'relative', fontFamily: "'Montserrat', sans-serif" }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 12, borderBottom: '2px solid #222', paddingBottom: 16,
          opacity: headerVis ? 1 : 0,
          transform: headerVis ? 'translateY(0)' : 'translateY(-10px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
        }}>
          <h2
            data-testid="text-sessions-title"
            style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7eb8f7', margin: 0 }}
          >
            Trading Sessions
          </h2>
          <p style={{ fontSize: 11, fontWeight: 500, color: '#8a9bb0', letterSpacing: '0.02em', margin: 0 }}>
            Select a session to view dashboard, metrics &amp; trade vault
          </p>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: '#60a5fa', border: '2px solid #60a5fa', padding: '6px 14px', whiteSpace: 'nowrap',
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
