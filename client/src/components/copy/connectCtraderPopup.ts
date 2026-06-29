import { apiRequest } from '@/lib/queryClient';

export interface CtraderConnectResult {
  status: 'connected' | 'select';   // 'select' = the cTrader login has >1 trading account
  accountId: string;                // the broker-account row (already created server-side)
}

/**
 * Connect a brand-new cTrader account WITHOUT leaving the page: create the broker-account row,
 * then run the cTrader OAuth in a popup window. The server callback posts the result back to us
 * (and closes the popup), so the user never lands on the Accounts page.
 *
 * Resolves 'connected' (single account — done) or 'select' (caller must pick a sub-account).
 * Rejects on error, popup-blocked, or the user closing the window.
 */
export async function connectCtraderPopup(name = 'cTrader'): Promise<CtraderConnectResult> {
  const createRes = await apiRequest('POST', '/api/broker-accounts', {
    name,
    loginId: `pending_${Date.now()}`,
    platform: 'ctrader',
    accountType: 'demo',
    connectionType: 'api',
  });
  const created = await createRes.json();
  const accountId: string = created?.id;
  if (!accountId) throw new Error('Could not create the account.');

  const connRes = await apiRequest('GET', `/api/broker/ctrader/connect?accountId=${accountId}&popup=1`);
  const conn = await connRes.json();
  if (!conn?.url) throw new Error(conn?.error || 'cTrader OAuth is not configured on the server.');

  const w = 560, h = 760;
  const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
  const top  = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
  const popup = window.open(conn.url, 'ctrader_oauth', `width=${w},height=${h},left=${left},top=${top}`);
  if (!popup) throw new Error('Popup blocked — allow popups for this site and try again.');

  return new Promise<CtraderConnectResult>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => { if (!settled) { settled = true; cleanup(); fn(); } };
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data;
      if (!d || d.source !== 'ctrader-oauth') return;
      if (d.status === 'error') finish(() => reject(new Error(d.error || 'cTrader connection failed.')));
      else finish(() => resolve({
        status: d.status === 'select' ? 'select' : 'connected',
        accountId: d.accountId || d.token || accountId,
      }));
    };
    const timer = window.setInterval(() => {
      if (popup.closed) finish(() => reject(new Error('Connection window was closed before finishing.')));
    }, 700);
    function cleanup() { window.removeEventListener('message', onMsg); window.clearInterval(timer); }
    window.addEventListener('message', onMsg);
  });
}
