import { useState, useEffect } from 'react';
import { Globe } from 'lucide-react';
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
    <div className="max-w-2xl mx-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-md p-10">
        <div className="mb-8">
          <h2 className="text-sm font-semibold" data-testid="text-create-session-title">Create New Session</h2>
          <p className="text-sm text-slate-400">Start a new trading session to track your performance</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6" data-testid="form-create-session">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Session Name</label>
            <input
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="e.g., Morning Scalping Session"
              className="w-full bg-slate-800/50 border border-slate-700 rounded-md px-5 py-3.5 text-sm font-medium text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
              required
              data-testid="input-session-name"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Starting Balance</label>
            <div className="relative">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
              <input
                type="number"
                value={startingBalance}
                onChange={(e) => setStartingBalance(e.target.value)}
                placeholder="10000"
                className="w-full bg-slate-800/50 border border-slate-700 rounded-md pl-10 pr-5 py-3.5 text-sm font-medium text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-mono"
                min="0"
                step="0.01"
                required
                data-testid="input-starting-balance"
              />
            </div>
          </div>

          {/* ✅ FIX: Show form-level errors from both client validation and server response */}
          {formError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-md px-4 py-3">
              <p className="text-xs font-semibold text-red-400" data-testid="text-form-error">{formError}</p>
            </div>
          )}

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-widest px-6 py-4 rounded-md transition-all shadow-xl shadow-indigo-600/20 border border-indigo-500/50 disabled:opacity-50"
              data-testid="button-create-session"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Session'}
            </button>
          </div>
        </form>
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
  const visible = useVisible(index * 80 + 120);
  const pulse = usePulse();
  const { totalPnL, tradeCount, isLoading: balLoading } = useSessionBalance(session.id);
  const startBal = parseFloat(session.startingBalance) || 0;
  const pnlPositive = totalPnL >= 0;
  const pnlColor = totalPnL === 0 ? 'rgba(148,163,184,0.7)' : pnlPositive ? '#34d399' : '#fb7185';
  const dateStr = session.createdAt ? new Date(session.createdAt).toLocaleDateString() : '';

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      data-testid={`card-session-${session.id}`}
      style={{
        borderRadius: 16,
        background: isActive
          ? 'linear-gradient(160deg,#141e2e 0%,#0f1a28 100%)'
          : hov
          ? 'linear-gradient(160deg,#111827 0%,#0d1420 100%)'
          : 'linear-gradient(160deg,#0e1623 0%,#0a1018 100%)',
        border: `1px solid ${isActive ? 'rgba(99,210,170,0.45)' : hov ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)'}`,
        boxShadow: isActive
          ? '0 0 0 1px rgba(99,210,170,0.12),0 16px 48px rgba(0,0,0,0.5),0 0 32px rgba(99,210,170,0.06)'
          : hov
          ? '0 12px 40px rgba(0,0,0,0.4)'
          : '0 4px 20px rgba(0,0,0,0.3)',
        cursor: 'pointer',
        padding: '28px 26px',
        transition: 'all 0.3s ease',
        transform: visible ? (hov && !isActive ? 'translateY(-4px)' : 'translateY(0)') : 'translateY(20px)',
        opacity: visible ? 1 : 0,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {isActive && (
        <div style={{
          position: 'absolute', top: 0, left: '20%', right: '20%', height: 1,
          background: 'linear-gradient(90deg,transparent,rgba(99,210,170,0.8),transparent)',
        }} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <span
          data-testid={`text-session-name-${session.id}`}
          className="sc-title"
          style={{ fontSize: 22, color: isActive ? '#e8f4f0' : '#b0bfd4', transition: 'color 0.2s ease' }}
        >
          {session.sessionName}
        </span>
        {isActive && (
          <span className="sc-mono-600" style={{
            fontSize: 9,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#63d2aa',
            background: 'rgba(99,210,170,0.1)',
            border: '1px solid rgba(99,210,170,0.25)',
            padding: '3px 8px',
            borderRadius: 5,
          }}>
            ACTIVE
          </span>
        )}
      </div>

      <div className="sc-mono" style={{
        fontSize: 10,
        color: isActive ? 'rgba(99,210,170,0.45)' : 'rgba(255,255,255,0.2)',
        letterSpacing: '0.05em',
        marginBottom: 24,
        transition: 'color 0.2s ease',
      }}>
        {dateStr}
      </div>

      <div style={{
        height: 1,
        background: isActive
          ? 'linear-gradient(90deg,rgba(99,210,170,0.15),rgba(99,210,170,0.05))'
          : 'rgba(255,255,255,0.05)',
        marginBottom: 18,
        transition: 'background 0.2s ease',
      }} />

      <div className="sc-mono" style={{
        fontSize: 9,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: isActive ? 'rgba(99,210,170,0.5)' : 'rgba(255,255,255,0.22)',
        marginBottom: 10,
        transition: 'color 0.2s ease',
      }}>
        Starting Balance
      </div>
      <div className="sc-sans" style={{
        fontSize: 34,
        letterSpacing: '-0.02em',
        color: isActive ? '#ffffff' : '#c5d2e8',
        marginBottom: !balLoading && tradeCount > 0 ? 14 : 24,
        lineHeight: 1,
        transition: 'color 0.2s ease',
      }}>
        ${startBal.toLocaleString()}
      </div>

      {!balLoading && tradeCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div className="sc-mono" style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', marginBottom: 4 }}>P&L</div>
            <div className="sc-mono-600" style={{ fontSize: 13, color: pnlColor }}>
              {pnlPositive ? '+' : ''}{totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="sc-mono" style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', marginBottom: 4 }}>Trades</div>
            <div className="sc-mono-600" style={{ fontSize: 13, color: 'rgba(148,163,184,0.8)' }}>{tradeCount}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="sc-mono" style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 9,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: '#63d2aa',
          background: 'rgba(99,210,170,0.07)',
          border: '1px solid rgba(99,210,170,0.14)',
          padding: '7px 12px',
          borderRadius: 7,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: pulse ? '#63d2aa' : 'rgba(99,210,170,0.3)',
            boxShadow: pulse ? '0 0 6px rgba(99,210,170,0.8)' : 'none',
            transition: 'all 0.6s ease',
          }} />
          {session.status || 'Active'}
        </div>

        <button
          onClick={onDelete}
          data-testid={`button-delete-session-${session.id}`}
          style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.07)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.22)',
            transition: 'all 0.18s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.08)';
            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)';
            e.currentTarget.style.color = 'rgba(239,100,100,0.7)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)';
            e.currentTarget.style.color = 'rgba(255,255,255,0.22)';
          }}
        >
          <TrashIcon />
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
      queryClient.invalidateQueries({ queryKey: ['/api/journal/entries', deletedId] });
      queryClient.invalidateQueries({ queryKey: ['/api/metrics/compute', deletedId] });
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
        .sessions-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
        @media (max-width: 900px) { .sessions-grid { grid-template-columns: repeat(2,1fr); } }
        @media (max-width: 560px) { .sessions-grid { grid-template-columns: 1fr; } }
        .journal-root .sessions-grid .sc-mono { font-family:'JetBrains Mono',monospace!important; font-weight:400!important; }
        .journal-root .sessions-grid .sc-mono-600 { font-family:'JetBrains Mono',monospace!important; font-weight:600!important; }
        .journal-root .sessions-grid .sc-sans { font-family:'Montserrat',sans-serif!important; font-weight:800!important; }
        .journal-root .sessions-grid .sc-title { font-family:'Montserrat',sans-serif!important; font-weight:800!important; letter-spacing:0.01em!important; }
        .journal-root .sessions-header .sc-mono { font-family:'JetBrains Mono',monospace!important; font-weight:400!important; }
        .journal-root .sessions-header .sc-sans { font-family:'Montserrat',sans-serif!important; font-weight:800!important; }
      `}</style>

      <div style={{ position: 'relative' }}>
        <div className="sessions-header" style={{
          marginBottom: 36,
          opacity: headerVis ? 1 : 0,
          transform: headerVis ? 'translateY(0)' : 'translateY(-10px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h2
              data-testid="text-sessions-title"
              className="sc-sans"
              style={{ fontSize: 20, color: '#e2eaf5', letterSpacing: '0.01em', margin: 0 }}
            >
              Trading Sessions
            </h2>
            <span className="sc-mono" style={{
              fontSize: 9,
              letterSpacing: '0.14em',
              color: 'rgba(99,210,170,0.55)',
              background: 'rgba(99,210,170,0.06)',
              border: '1px solid rgba(99,210,170,0.14)',
              padding: '4px 11px',
              borderRadius: 100,
            }}>
              {sessions.length} {sessions.length === 1 ? 'SESSION' : 'SESSIONS'}
            </span>
          </div>
          <p className="sc-mono" style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.04em', lineHeight: 1.7, margin: 0 }}>
            Select a session to view its data across Dashboard, Metrics, and Trade Vault
          </p>
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
