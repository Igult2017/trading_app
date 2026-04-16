/**
 * Binance adapter — USDM Futures + Spot
 *
 * Futures:  fapi.binance.com   Auth: HMAC-SHA256 on query string
 * Spot:     api.binance.com    Same auth, but requires symbol per request
 *
 * Credentials stored encrypted in brokerAccount.passwordEnc as JSON:
 *   { secret: "apiSecret" }
 * API key stored in brokerAccount.loginId
 * Symbols (optional) stored in brokerAccount.server as "BTCUSDT,ETHUSDT"
 */
import { createHmac } from 'crypto';
import type { RawBrokerTrade } from '../brokerSyncService';

const FUTURES_BASE = 'https://fapi.binance.com';
const SPOT_BASE    = 'https://api.binance.com';

function sign(queryString: string, secret: string): string {
  return createHmac('sha256', secret).update(queryString).digest('hex');
}

async function signedGet(base: string, path: string, apiKey: string, secret: string, params: Record<string, string | number> = {}): Promise<any> {
  const ts       = Date.now();
  const qsBase   = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), timestamp: String(ts) }).toString();
  const sig      = sign(qsBase, secret);
  const url      = `${base}${path}?${qsBase}&signature=${sig}`;
  const res      = await fetch(url, { headers: { 'X-MBX-APIKEY': apiKey } });
  const data     = await res.json() as any;
  if (!res.ok) throw new Error(`Binance ${path}: ${data.msg ?? res.status}`);
  return data;
}

// ── Futures USDM ─────────────────────────────────────────────────────────────

async function fetchFuturesTrades(apiKey: string, secret: string, fromMs: number, toMs: number): Promise<RawBrokerTrade[]> {
  // income endpoint returns REALIZED_PNL per closing trade — no symbol needed
  const income: any[] = await signedGet(FUTURES_BASE, '/fapi/v1/income', apiKey, secret, {
    incomeType: 'REALIZED_PNL',
    startTime:  fromMs,
    endTime:    toMs,
    limit:      1000,
  });

  // Gather unique symbols from income events, then fetch actual trade details
  const symbols = Array.from(new Set(income.map((i: any) => i.symbol as string)));
  const trades: RawBrokerTrade[] = [];

  for (const symbol of symbols) {
    const raw: any[] = await signedGet(FUTURES_BASE, '/fapi/v1/userTrades', apiKey, secret, {
      symbol,
      startTime: fromMs,
      endTime:   toMs,
      limit:     1000,
    });

    // Group "reducing" trades (buyer=false on short close / buyer=true on long close)
    // Each closing trade is its own journal entry
    for (const t of raw) {
      if (!t.realizedPnl || parseFloat(t.realizedPnl) === 0) continue; // skip opening fills

      // match P&L from income
      const incomeMatch = income.find((i: any) => i.tranId === t.id || i.info === String(t.id));
      const profit = incomeMatch ? parseFloat(incomeMatch.income) : parseFloat(t.realizedPnl);

      trades.push({
        externalId:  String(t.id),
        symbol:      t.symbol,
        direction:   t.side === 'BUY' ? 'Long' : 'Short',
        lots:        parseFloat(t.qty),
        closePrice:  parseFloat(t.price),
        closeTime:   t.time,
        profit,
        commission:  -Math.abs(parseFloat(t.commission ?? '0')),
        rawData:     t,
      });
    }
  }

  return trades;
}

// ── Spot ──────────────────────────────────────────────────────────────────────

async function fetchSpotTrades(apiKey: string, secret: string, symbols: string[], fromMs: number, toMs: number): Promise<RawBrokerTrade[]> {
  const trades: RawBrokerTrade[] = [];

  for (const symbol of symbols) {
    const raw: any[] = await signedGet(SPOT_BASE, '/api/v3/myTrades', apiKey, secret, {
      symbol,
      startTime: fromMs,
      endTime:   toMs,
      limit:     1000,
    });

    for (const t of raw) {
      trades.push({
        externalId:  String(t.id),
        symbol:      t.symbol,
        direction:   t.isBuyer ? 'Long' : 'Short',
        lots:        parseFloat(t.qty),
        closePrice:  parseFloat(t.price),
        closeTime:   t.time,
        profit:      parseFloat(t.quoteQty) * (t.isBuyer ? -1 : 1),
        commission:  -Math.abs(parseFloat(t.commission ?? '0')),
        rawData:     t,
      });
    }
  }

  return trades;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function fetchBinanceTrades(
  apiKey:    string,
  secret:    string,
  fromMs:    number,
  toMs:      number,
  symbols?:  string,   // comma-separated, optional; if absent uses futures
): Promise<RawBrokerTrade[]> {
  if (symbols) {
    const list = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    return fetchSpotTrades(apiKey, secret, list, fromMs, toMs);
  }
  return fetchFuturesTrades(apiKey, secret, fromMs, toMs);
}
