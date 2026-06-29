// Throwaway harness: render the REAL integrated CopierWizard in isolation (no login).
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { CopierWizard } from '@/pages/TradeSyncPage';

// Seed the account picker so the Account step renders with data (no backend needed).
queryClient.setQueryData(['/api/broker-accounts'], [
  { id: '1', name: 'Live Main', loginId: '7741209', platform: 'ctrader', accountType: 'live', balance: '42180.55', currency: 'USD' },
  { id: '2', name: 'Quantum Demo', loginId: '5296567', platform: 'ctrader', accountType: 'demo', balance: '10000.00', currency: 'USD' },
]);

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <CopierWizard onBack={() => {}} onOpenDashboard={() => {}} />
  </QueryClientProvider>
);
