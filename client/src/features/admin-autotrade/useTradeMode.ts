import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAdminData } from '@/features/admin-data/useAdminData';

/**
 * The trading mode behind the Autotrade page's two switches (16 Nov 2026): off | auto | confirm.
 *
 * His rule: *"Only one switch can work at a time. If I switch DM confirm on, autotrade goes off."* So
 * the two switches are two views of ONE saved value — there is no state in which both are on.
 */
export type TradeMode = 'off' | 'auto' | 'confirm';
export interface TradeModeState { mode: TradeMode; updatedAt: string | null; updatedBy: string | null }

export const TRADE_MODE_URL = '/api/admin/trade-mode';

/** What flipping one switch makes the mode: on → that mode (the other goes off); off → OFF. */
export function nextMode(which: 'auto' | 'confirm', on: boolean): TradeMode {
  return on ? which : 'off';
}

export function useTradeMode() {
  const qc = useQueryClient();
  const { data, loading, error } = useAdminData<TradeModeState | null>(TRADE_MODE_URL, { fallback: null });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const setMode = async (mode: TradeMode) => {
    setSaving(true);
    setSaveError(null);
    try {
      const { authFetch } = await import('@/lib/queryClient');
      const r = await authFetch(TRADE_MODE_URL, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }),
      });
      if (!r.ok) {
        setSaveError(`The switch did not save (${r.status}). Nothing changed.`);
        return;
      }
      qc.setQueryData([TRADE_MODE_URL], await r.json());
    } catch (e: any) {
      setSaveError(`The switch did not save (${e?.message ?? 'network error'}). Nothing changed.`);
    } finally {
      setSaving(false);
    }
  };

  /** "Send a test card" — the live end-to-end check of DM confirmation. Places nothing. */
  const [test, setTest] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const sendTestCard = async () => {
    setTest('sending');
    try {
      const { authFetch } = await import('@/lib/queryClient');
      const r = await authFetch(`${TRADE_MODE_URL}/test-card`, { method: 'POST' });
      setTest(r.ok ? 'sent' : 'failed');
    } catch {
      setTest('failed');
    }
  };

  return { state: data, loading, error, saving, saveError, setMode, test, sendTestCard };
}
