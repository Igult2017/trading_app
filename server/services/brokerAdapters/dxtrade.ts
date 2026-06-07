/**
 * DXTrade adapter — fetches closed positions via REST API.
 * Credentials: loginId = username, server = broker API base URL,
 * passwordEnc decrypts to { password: "..." }
 */
import type { RawBrokerTrade } from '../brokerSyncService';

async function getToken(serverUrl: string, username: string, password: string): Promise<string> {
  const res = await fetch(`${serverUrl}/auth/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`DXTrade auth failed: ${res.status}`);
  const data = await res.json() as any;
  const token = data.token ?? data.accessToken ?? data.access_token;
  if (!token) throw new Error('DXTrade: no token in auth response');
  return token;
}

async function getAccountId(serverUrl: string, token: string): Promise<string> {
  const res = await fetch(`${serverUrl}/user/accounts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`DXTrade accounts: ${res.status}`);
  const data = await res.json() as any;
  const list = Array.isArray(data) ? data : (data.accounts ?? []);
  const id = list[0]?.id ?? list[0]?.accountId;
  if (!id) throw new Error('DXTrade: no account found');
  return String(id);
}

export async function fetchDXTradeTrades(
  serverUrl: string,
  username:  string,
  password:  string,
  fromMs:    number,
  toMs:      number,
): Promise<RawBrokerTrade[]> {
  const token   = await getToken(serverUrl, username, password);
  const accId   = await getAccountId(serverUrl, token);
  const from    = new Date(fromMs).toISOString().slice(0, 19);
  const to      = new Date(toMs).toISOString().slice(0, 19);

  const res = await fetch(
    `${serverUrl}/user/accounts/${accId}/positions?status=CLOSED&from=${from}&to=${to}&limit=500`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`DXTrade positions: ${res.status}`);
  const data = await res.json() as any;
  const rows: any[] = Array.isArray(data) ? data : (data.positions ?? data.items ?? []);

  return rows.map(p => ({
    externalId:  String(p.positionId ?? p.id),
    symbol:      String(p.instrument ?? p.symbol ?? p.code),
    direction:   (p.side ?? p.orderSide ?? '').toUpperCase() === 'BUY' ? 'Long' : 'Short',
    lots:        parseFloat(p.qty ?? p.volume ?? p.quantity ?? 0) / 100_000,
    openPrice:   parseFloat(p.openPrice ?? p.entryPrice ?? 0),
    closePrice:  parseFloat(p.closePrice ?? p.exitPrice ?? 0),
    openTime:    p.openTime  ? new Date(p.openTime).getTime()  : fromMs,
    closeTime:   p.closeTime ? new Date(p.closeTime).getTime() : toMs,
    profit:      parseFloat(p.pnl ?? p.profit ?? p.realizedPnl ?? 0),
    commission:  -Math.abs(parseFloat(p.commission ?? p.fee ?? 0)),
    rawData:     p,
  }));
}
