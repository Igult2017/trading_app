import { useState } from 'react';
import { Globe, Trash2 } from 'lucide-react';
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

const SessionCard = ({ session, isActive, onSelect, onDelete }: {
  session: SessionData;
  isActive: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) => {
  const { currentBalance, totalPnL, tradeCount, isLoading } = useSessionBalance(session.id);
  const startBal = parseFloat(session.startingBalance) || 0;
  const pnlPositive = totalPnL >= 0;
  const pnlColor = totalPnL === 0 ? '#94a3b8' : pnlPositive ? '#34d399' : '#fb7185';

  return (
    <div
      onClick={onSelect}
      className={`bg-slate-900 border rounded-md p-6 cursor-pointer transition-all ${isActive ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-slate-800 hover:border-slate-700'}`}
      data-testid={`card-session-${session.id}`}
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-black text-white mb-1 tracking-tight" data-testid={`text-session-name-${session.id}`}>{session.sessionName}</h3>
          <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">{session.createdAt ? new Date(session.createdAt).toLocaleDateString() : ''}</p>
        </div>
        {isActive && <span className="text-[8px] font-black uppercase tracking-widest bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded">Active</span>}
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 font-black">Current Balance</p>
          <p className="text-xl font-bold font-mono" style={{ color: pnlColor }}>
            {isLoading ? <span className="text-slate-600">—</span> : `$${currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </p>
        </div>

        <div className="flex justify-between items-center">
          <div>
            <p className="text-[9px] text-slate-600 uppercase tracking-wider font-black mb-0.5">Starting Balance</p>
            <p className="text-xs text-slate-400 font-mono">${startBal.toLocaleString()}</p>
          </div>
          {!isLoading && tradeCount > 0 && (
            <div className="text-right">
              <p className="text-[9px] text-slate-600 uppercase tracking-wider font-black mb-0.5">P&amp;L</p>
              <p className="text-xs font-mono font-bold" style={{ color: pnlColor }}>
                {pnlPositive ? '+' : ''}{totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-slate-800 flex justify-between items-center">
          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded ${session.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-700/30 text-slate-400'}`}>
            {session.status || 'active'}
          </span>
          <button
            onClick={onDelete}
            className="text-slate-600 hover:text-red-400 transition-colors p-1"
            data-testid={`button-delete-session-${session.id}`}
          >
            <Trash2 size={14} />
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
      <div className="max-w-4xl mx-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-md p-16 text-center">
          <p className="text-sm text-slate-400">Loading sessions...</p>
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-md p-16 text-center">
          <div className="w-20 h-20 bg-slate-800/50 rounded-md flex items-center justify-center mx-auto mb-6">
            <Globe size={32} className="text-slate-600" />
          </div>
          <h3 className="text-sm font-semibold text-white mb-2" data-testid="text-no-sessions">No Sessions Yet</h3>
          <p className="text-sm text-slate-400 mb-8">Create your first trading session to start tracking your performance</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-sm font-semibold" data-testid="text-sessions-title">Trading Sessions</h2>
        <p className="text-sm text-slate-400">Select a session to view its data across Dashboard, Metrics, and Trade Vault</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            isActive={activeSessionId === session.id}
            onSelect={() => onSelectSession(session.id)}
            onDelete={(e) => { e.stopPropagation(); deleteMutation.mutate(session.id); }}
          />
        ))}
      </div>
    </div>
  );
};
