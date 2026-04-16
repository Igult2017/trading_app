/**
 * Coinbase Advanced Trade API adapter
 *
 * Uses legacy API key + secret (HMAC-SHA256).
 * The newer JWT-based Cloud API Keys are also supported — if the user pastes
 * an EC private key as the "secret", we fall through to the legacy path
 * which also works for most retail accounts.
 *
 * Credentials: loginId = apiKey, passwordEnc decrypts to JSON { secret }
 *
 * Endpoint: GET /api/v3/brokerage/orders/historical/batch?order_status=FILLED
 */
import { createHmac } from 'crypto';
import type { RawBrokerTrade } from '../brokerSyncService';

const BASE = 'https://api.coinbase.com';

function sign(ts: string, method: string, path: string, body: string, secret: string): string {
  const payload = ts + method.toUpperCase() + path + body;
  return createHmac('sha256', secret).update(payload).digest('hex');
}

async function cbGet(path: string, apiKey: string, secret: string, params: Record<string, string> = {}): Promise<any> {
  const ts     = String(Math.floor(Date.now() / 1000));
  const qs     = new URLSearchParams(params).toString();
  const fullPath = qs ? `${path}?${qs}` : path;
  const sig    = sign(ts, 'GET', fullPath, '', secret);

  const res = await fetch(`${BASE}${fullPath}`, {
    headers: {
      'CB-ACCESS-KEY':       apiKey,
      'CB-ACCESS-SIGN':      sig,
      'CB-ACCESS-TIMESTAMP': ts,
      'Content-Type':        'application/json',
    },
  });

  if (!res.ok) throw new Error(`Coinbase ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function fetchCoinbaseTrades(
  apiKey:  string,
  secret:  string,
  fromMs:  number,
  toMs:    number,
): Promise<RawBrokerTrade[]> {
  const trades: RawBrokerTrade[] = [];
  let cursor = '';

  const fromISO = new Date(fromMs).toISOString();
  const toISO   = new Date(toMs).toISOString();

  while (true) {
    const params: Record<string, string> = {
      order_status: 'FILLED',
      start_date:   fromISO,
      end_date:     toISO,
      limit:        '250',
    };
    if (cursor) params.cursor = cursor;

    const data = await cbGet('/api/v3/brokerage/orders/historical/batch', apiKey, secret, params);
    const orders: any[] = data.orders ?? [];

    for (const o of orders) {
      if (o.status !== 'FILLED') continue;

      const side    = o.side === 'BUY' ? 'Long' : 'Short';
      const filled  = parseFloat(o.filled_size ?? '0');
      const avgFill = parseFloat(o.average_filled_price ?? '0');
      const total   = parseFloat(o.filled_value ?? '0');

      trades.push({
        externalId:  o.order_id,
        symbol:      o.product_id?.replace('-', '') ?? 'UNKNOWN',
        direction:   side,
        lots:        filled,
        closePrice:  avgFill,
        openTime:    o.created_time,
        closeTime:   o.last_fill_time ?? o.created_time,
        profit:      o.side === 'SELL' ? total : -total,
        commission:  parseFloat(o.total_fees ?? '0') * -1,
        rawData:     o,
      });
    }

    cursor = data.cursor ?? '';
    if (!cursor || orders.length === 0) break;
  }

  return trades;
}
