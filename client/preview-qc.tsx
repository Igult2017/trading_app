// Throwaway harness to render real Quiet Capital Trade Sync components in isolation (no login).
// Switch screens via ?s=role|account
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import QcShell from '@/components/copy/redesign/QcShell';
import QcRoleStep from '@/components/copy/redesign/QcRoleStep';
import QcAccountStep, { type QcAcct } from '@/components/copy/redesign/QcAccountStep';

const STEPS = [
  { id: 'role', label: 'Identity' }, { id: 'account', label: 'Account' },
  { id: 'provider', label: 'Provider' }, { id: 'engine', label: 'Engine' }, { id: 'live', label: 'Live' },
];
const MOCK: QcAcct[] = [
  { id: '1', name: 'Live Main', loginId: '7741209', accountType: 'live', balance: '42,180.55', currency: 'USD' },
  { id: '2', name: 'Quantum Demo', loginId: '5296567', accountType: 'demo', balance: '10,000.00', currency: 'USD' },
];
const screen = new URLSearchParams(location.search).get('s') || 'role';

function Demo() {
  const [role, setRole] = useState('follower');
  const [acct, setAcct] = useState('1');
  if (screen === 'account') {
    return <QcShell steps={STEPS} current={1} contentWidth={560}><QcAccountStep accounts={MOCK} value={acct} onChange={setAcct} /></QcShell>;
  }
  return <QcShell steps={STEPS} current={0} backDisabled><QcRoleStep value={role} onChange={setRole} /></QcShell>;
}

createRoot(document.getElementById('root')!).render(<Demo />);
