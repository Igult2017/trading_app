// Throwaway harness to render real Quiet Capital Trade Sync components in isolation (no login).
// Switch screens via ?s=role|account|provider|engine|strategy|risk|telegram|golive|dashboard|landing
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import QcShell from '@/components/copy/redesign/QcShell';
import QcRoleStep from '@/components/copy/redesign/QcRoleStep';
import QcAccountStep, { type QcAcct } from '@/components/copy/redesign/QcAccountStep';
import QcProviderStep from '@/components/copy/redesign/QcProviderStep';
import QcEngineStep from '@/components/copy/redesign/QcEngineStep';
import QcStrategyStep from '@/components/copy/redesign/QcStrategyStep';
import QcRiskStep from '@/components/copy/redesign/QcRiskStep';
import QcTelegramChannelStep from '@/components/copy/redesign/QcTelegramChannelStep';
import QcGoLive from '@/components/copy/redesign/QcGoLive';
import QcDashboard from '@/components/copy/redesign/QcDashboard';
import QcLanding from '@/components/copy/redesign/QcLanding';

const STEPS = [
  { id: 'role', label: 'Identity' }, { id: 'account', label: 'Account' },
  { id: 'provider', label: 'Provider' }, { id: 'engine', label: 'Engine' }, { id: 'live', label: 'Live' },
];
const ACCTS: QcAcct[] = [
  { id: '1', name: 'Live Main', loginId: '7741209', accountType: 'live', balance: '42,180.55', currency: 'USD' },
  { id: '2', name: 'Quantum Demo', loginId: '5296567', accountType: 'demo', balance: '10,000.00', currency: 'USD' },
];
const PROVIDERS = [
  { id: 'p1', name: 'Quantum Swing v3', platform: 'cTrader', accountType: 'live', winRate: 68, trades: 274, avgRR: 2.3, netPnl: '+$12.4k', instruments: ['EURUSD', 'XAUUSD', 'GBPJPY'] },
  { id: 'p2', name: 'Apex Scalper', platform: 'cTrader', accountType: 'live', winRate: 74, trades: 1142, avgRR: 1.4, netPnl: '+$8.1k', instruments: ['NAS100', 'US30'] },
  { id: 'p3', name: 'Macro Rider', platform: 'cTrader', accountType: 'live', winRate: 59, trades: 96, avgRR: 3.8, netPnl: '+$21.9k', instruments: ['EURUSD', 'USDJPY', 'XAUUSD'] },
  { id: 'p4', name: 'Tokyo Nights', platform: 'cTrader', accountType: 'demo', winRate: 63, trades: 418, avgRR: 1.9, netPnl: '+$5.6k', instruments: ['USDJPY', 'AUDUSD'] },
];
const GOLIVE_SUMMARY = [
  { label: 'Role', value: 'Copy Follower' }, { label: 'Following', value: 'Quantum Swing v3' },
  { label: 'Account', value: 'Live Main · #7741209' }, { label: 'Lot engine', value: '1.0× multiplier' },
  { label: 'Daily loss cap', value: '2.0%' }, { label: 'Status', value: 'Live', badge: 'live' as const },
];
const KPIS = [
  { label: 'Copied P&L', value: '+$3,412.80', delta: '+12.4% this month', deltaUp: true },
  { label: 'Win Rate', value: '68.2%', delta: '187 / 274 copied' },
  { label: 'Active Followers', value: '24', delta: '+3 this week', deltaUp: true },
  { label: 'Open Volume', value: '3.40 lots', delta: 'across 6 positions' },
];
const TRADES = [
  { symbol: 'EURUSD', volume: '0.50', side: 'long' as const, provider: 'Quantum', pnl: '+$184.20', up: true },
  { symbol: 'XAUUSD', volume: '0.20', side: 'short' as const, provider: 'Macro', pnl: '−$62.50', up: false },
  { symbol: 'GBPJPY', volume: '0.30', side: 'long' as const, provider: 'Quantum', pnl: '+$311.00', up: true },
  { symbol: 'NAS100', volume: '0.10', side: 'long' as const, provider: 'Apex', pnl: '+$96.40', up: true },
];
const ALLOC = [
  { name: 'Quantum Swing', pct: 55, color: '#5B6CFF' }, { name: 'Apex Scalper', pct: 30, color: '#2FCB7E' }, { name: 'Macro Rider', pct: 15, color: '#F5A623' },
];

const s = new URLSearchParams(location.search).get('s') || 'role';

function Demo() {
  const [role, setRole] = useState('follower');
  const [acct, setAcct] = useState('1');
  const [prov, setProv] = useState('p1');
  const [lotMode, setLotMode] = useState<'mult' | 'fixed' | 'risk'>('mult');
  const [mult, setMult] = useState('1.00');
  const [dir, setDir] = useState('same');
  const [pause, setPause] = useState(true);
  const [sname, setSname] = useState('');
  const [sdesc, setSdesc] = useState('');
  const [sess, setSess] = useState(['London', 'New York']);
  const [acks, setAcks] = useState({ provider: true, understand: true, terms: false });
  const [chan, setChan] = useState('@quantum_signals');

  if (s === 'dashboard') return <QcDashboard kpis={KPIS} trades={TRADES} allocation={ALLOC} />;
  if (s === 'landing') return <QcLanding />;
  if (s === 'golive') return <QcShell steps={STEPS} current={4} hideFooter contentWidth={560}><QcGoLive state="success" summary={GOLIVE_SUMMARY} /></QcShell>;
  if (s === 'account') return <QcShell steps={STEPS} current={1} contentWidth={560}><QcAccountStep accounts={ACCTS} value={acct} onChange={setAcct} /></QcShell>;
  if (s === 'provider') return <QcShell steps={STEPS} current={2}><QcProviderStep providers={PROVIDERS} value={prov} onChange={setProv} /></QcShell>;
  if (s === 'engine') return <QcShell steps={STEPS} current={3} contentWidth={640}><QcEngineStep lotMode={lotMode} onLotMode={(m) => setLotMode(m as any)} multiplier={mult} onMultiplier={setMult} direction={dir} onDirection={setDir} pauseInactive={pause} onPauseInactive={setPause} /></QcShell>;
  if (s === 'strategy') return <QcShell steps={STEPS} current={2} contentWidth={600}><QcStrategyStep name={sname} onName={setSname} description={sdesc} onDescription={setSdesc} sessions={sess} onToggleSession={(x) => setSess(p => p.includes(x) ? p.filter(y => y !== x) : [...p, x])} /></QcShell>;
  if (s === 'risk') return <QcShell steps={STEPS} current={2} contentWidth={600}><QcRiskStep acks={acks} onToggle={(k) => setAcks(p => ({ ...p, [k]: !(p as any)[k] }))} /></QcShell>;
  if (s === 'telegram') return <QcShell steps={STEPS} current={2} contentWidth={600}><QcTelegramChannelStep channel={chan} onChannel={setChan} /></QcShell>;
  return <QcShell steps={STEPS} current={0} backDisabled><QcRoleStep value={role} onChange={setRole} /></QcShell>;
}

createRoot(document.getElementById('root')!).render(<Demo />);
