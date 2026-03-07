import { useState } from 'react';
import { Globe } from 'lucide-react';

interface SessionData {
  id: number;
  sessionName: string;
  startingBalance: number;
  currentBalance: number;
  createdAt: string;
  trades: any[];
}

interface CreateSessionFormProps {
  onSubmit: (data: { sessionName: string; startingBalance: number }) => void;
}

export const CreateSessionForm = ({ onSubmit }: CreateSessionFormProps) => {
  const [sessionName, setSessionName] = useState('');
  const [startingBalance, setStartingBalance] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ sessionName, startingBalance: parseFloat(startingBalance) });
    setSessionName('');
    setStartingBalance('');
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
            <input type="text" value={sessionName} onChange={(e) => setSessionName(e.target.value)} placeholder="e.g., Morning Scalping Session" className="w-full bg-slate-800/50 border border-slate-700 rounded-md px-5 py-3.5 text-sm font-medium text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all" required data-testid="input-session-name" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Starting Balance</label>
            <div className="relative">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
              <input type="number" value={startingBalance} onChange={(e) => setStartingBalance(e.target.value)} placeholder="10000" className="w-full bg-slate-800/50 border border-slate-700 rounded-md pl-10 pr-5 py-3.5 text-sm font-medium text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-mono" min="0" step="0.01" required data-testid="input-starting-balance" />
            </div>
          </div>
          <div className="flex gap-4 pt-4">
            <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-widest px-6 py-4 rounded-md transition-all shadow-xl shadow-indigo-600/20 border border-indigo-500/50" data-testid="button-create-session">Create Session</button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface SessionsListProps {
  sessions: SessionData[];
  onDeleteSession: (id: number) => void;
}

export const SessionsList = ({ sessions, onDeleteSession }: SessionsListProps) => {
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
        <p className="text-sm text-slate-400">Manage and track all your trading sessions</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sessions.map((session) => {
          const profitLoss = session.currentBalance - session.startingBalance;
          const profitLossPercent = ((profitLoss / session.startingBalance) * 100).toFixed(2);
          const isProfit = profitLoss >= 0;
          return (
            <div key={session.id} className="bg-slate-900 border border-slate-800 rounded-md p-6 hover:border-slate-700 transition-all" data-testid={`card-session-${session.id}`}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-black text-white mb-1 tracking-tight" data-testid={`text-session-name-${session.id}`}>{session.sessionName}</h3>
                  <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">{new Date(session.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 font-black">Starting Balance</p>
                  <p className="text-xl font-bold text-white font-mono">${session.startingBalance.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 font-black">Current Balance</p>
                  <p className="text-xl font-bold text-white font-mono">${session.currentBalance.toLocaleString()}</p>
                </div>
                <div className="pt-4 border-t border-slate-800">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-black">P&L</p>
                    <div className="text-right">
                      <p className={`text-sm font-black font-mono ${isProfit ? 'text-emerald-400' : 'text-red-400'}`} data-testid={`text-session-pnl-${session.id}`}>{isProfit ? '+' : ''}{profitLossPercent}%</p>
                      <p className={`text-xs font-mono ${isProfit ? 'text-emerald-400/60' : 'text-red-400/60'}`}>{isProfit ? '+' : ''}${profitLoss.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
