/**
 * TradeLocker adapter — fetches filled orders via REST API.
 * Credentials: loginId = email, server = broker server string (e.g. "ICMarkets-Live01"),
 * passwordEnc decrypts to { password: "..." }
 * accountType determines demo vs live base URL.
 */
import type { RawBrokerTrade } from '../brokerSyncService';

function baseUrl(accountType: string): string {
  return accountType === 'live'
    ? 'https://live.tradelocker.com/backend-service'
    : 'https://demo.tradelocker.com/backend-service';
}

interface TLAuth {
  accessToken:  string;
  refreshToken: string;
  accounts: Array<{ id: number; accNum: number; currency: string }>;
}

async function authenticate(
  base: string, email: string, password: string, server: string,
): Promise<TLAuth> {
  const res = await fetch(`${base}/auth/jwt/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password, server }),
  });
  if (!res.ok) throw new Error(`TradeLocker auth failed: ${res.status}`);
  const data = await res.json() as any;
  if (!data.accessToken) throw new Error('TradeLocker: no accessToken in response');
  return {
    accessToken:  data.accessToken,
    refreshToken: data.refreshToken,
    accounts:     (data.accounts ?? []).map((acc: any) => ({
      id:       acc.id,
      accNum:   acc.accNum ?? acc.accountId ?? acc.number ?? acc.id,
      currency: acc.currency ?? 'USD',
    })),
  };
}

async function fetchOrderHistory(
  base: string, token: string,
  accId: number, accNum: number,
  fromMs: number, toMs: number,
): Promise<any[]> {
  const startDate = new Date(fromMs).toISOString().slice(0, 10);
  const endDate   = new Date(toMs).toISOString().slice(0, 10);
  const url = `${base}/trade/accounts/${accId}/${accNum}/ordersHistory`
    + `?startDate=${startDate}&endDate=${endDate}&limit=500&status=Filled`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'env-id': 'tradelocker' } });
  if (!res.ok) throw new Error(`TradeLocker ordersHistory: ${res.status}`);
  const data = await res.json() as any;
  return Array.isArray(data) ? data : (data.d?.orders ?? data.orders ?? []);
}

export async function fetchTradeLockerTrades(
  email:       string,
  password:    string,
  server:      string,
  accountType: string,
  fromMs:      number,
  toMs:        number,
): Promise<RawBrokerTrade[]> {
  const base = baseUrl(accountType);
  const auth = await authenticate(base, email, password, server);
  if (!auth.accounts.length) throw new Error('TradeLocker: no accounts found');

  const trades: RawBrokerTrade[] = [];

  for (const acc of auth.accounts) {
    const rows = await fetchOrderHistory(base, auth.accessToken, acc.id, acc.accNum, fromMs, toMs);
    for (const o of rows) {
      trades.push({
        externalId:  String(o.id ?? o.orderId),
        symbol:      String(o.tradableInstrumentId ?? o.instrument ?? o.symbol),
        direction:   (o.side ?? o.tradeSide ?? '').toLowerCase() === 'buy' ? 'Long' : 'Short',
        lots:        parseFloat(o.qty ?? o.quantity ?? 0),
        openPrice:   parseFloat(o.price ?? o.openPrice ?? 0),
        closePrice:  parseFloat(o.filledPrice ?? o.closePrice ?? o.price ?? 0),
        openTime:    o.createdAt ? new Date(o.createdAt).getTime() : fromMs,
        closeTime:   o.filledAt  ? new Date(o.filledAt).getTime()  : toMs,
        profit:      parseFloat(o.realizedPnl ?? o.pnl ?? o.profit ?? 0),
        commission:  -Math.abs(parseFloat(o.commission ?? o.fee ?? 0)),
        rawData:     o,
      });
    }
  }

  return trades;
}
