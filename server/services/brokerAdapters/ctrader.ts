/**
 * cTrader Connect API adapter
 * Auth: OAuth2 (authorization code flow)
 * Requires env vars: CTRADER_CLIENT_ID, CTRADER_CLIENT_SECRET, CTRADER_REDIRECT_URI
 *
 * cTrader Connect REST endpoints used:
 *   POST /oauth2/token        — exchange auth code for tokens
 *   GET  /connect/tradingaccounts              — list user's MT accounts
 *   GET  /connect/tradingaccounts/:id/deals    — closed deal history
 */
import type { RawBrokerTrade } from '../brokerSyncService';

const CONNECT = 'https://connect.ctrader.com';
const API     = 'https://api.ctrader.com';

// ── OAuth2 ────────────────────────────────────────────────────────────────────

export function getCTraderAuthUrl(state: string): string {
  const clientId     = process.env.CTRADER_CLIENT_ID ?? '';
  const redirectUri  = process.env.CTRADER_REDIRECT_URI ?? '';
  if (!clientId) throw new Error('CTRADER_CLIENT_ID is not set');

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    scope:         'accounts trading',
    response_type: 'code',
    state,
  });
  return `${CONNECT}/oauth2/auth?${params}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const res = await fetch(`${CONNECT}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  process.env.CTRADER_REDIRECT_URI ?? '',
      client_id:     process.env.CTRADER_CLIENT_ID ?? '',
      client_secret: process.env.CTRADER_CLIENT_SECRET ?? '',
    }),
  });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(data.error_description ?? `cTrader token error: ${res.status}`);
  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresIn:    data.expires_in ?? 3600,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const res = await fetch(`${CONNECT}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     process.env.CTRADER_CLIENT_ID ?? '',
      client_secret: process.env.CTRADER_CLIENT_SECRET ?? '',
    }),
  });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(data.error_description ?? `cTrader refresh error: ${res.status}`);
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? refreshToken };
}

// ── Account list ──────────────────────────────────────────────────────────────

export interface CTraderAccount {
  ctidTraderAccountId: string;
  brokerName:  string;
  traderLogin: string;
  isLive:      boolean;
  balance:     number;
  currency:    string;
}

export async function getCTraderAccounts(accessToken: string): Promise<CTraderAccount[]> {
  const res = await fetch(`${API}/connect/tradingaccounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`cTrader accounts: ${res.status}`);
  const body = await res.json() as any;
  return body.data ?? body ?? [];
}

// ── Trade history ─────────────────────────────────────────────────────────────

export async function fetchCTraderTrades(
  accessToken:   string,
  ctraderId:     string,   // ctidTraderAccountId
  fromMs:        number,
  toMs:          number,
): Promise<RawBrokerTrade[]> {
  const url = `${API}/connect/tradingaccounts/${ctraderId}/deals`
    + `?from=${fromMs}&to=${toMs}&maxRows=500`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`cTrader deals ${res.status}: ${await res.text()}`);

  const body = await res.json() as any;
  const deals: any[] = body.data ?? body ?? [];

  return deals
    .filter((d: any) => d.dealStatus === 'FILLED' && d.closePositionDetail != null)
    .map((d: any): RawBrokerTrade => {
      const close = d.closePositionDetail;
      return {
        externalId:  String(d.dealId),
        symbol:      d.symbolName ?? d.tradeSide?.split('_')[0] ?? 'UNKNOWN',
        direction:   d.tradeSide === 'BUY' ? 'Long' : 'Short',
        lots:        d.filledVolume ? d.filledVolume / 100 : undefined, // cTrader volume is in 0.01 lots
        openPrice:   close?.entryPrice    ? parseFloat(close.entryPrice)    : undefined,
        closePrice:  d.executionPrice     ? parseFloat(d.executionPrice)     : undefined,
        openTime:    close?.entryTimestamp ? String(Math.floor(close.entryTimestamp / 1000)) : undefined,
        closeTime:   d.createTimestamp    ? String(Math.floor(d.createTimestamp / 1000))    : undefined,
        profit:      close?.grossProfit   ? parseFloat(close.grossProfit) / 100 : undefined,
        commission:  d.commission         ? parseFloat(d.commission) / 100       : undefined,
        swap:        close?.swap          ? parseFloat(close.swap) / 100         : undefined,
        comment:     d.comment,
      };
    });
}
