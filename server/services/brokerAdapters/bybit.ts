/**
 * ByBit V5 adapter
 *
 * Endpoint: GET /v5/execution/list  — returns ALL executions without needing symbol
 * Auth: HMAC-SHA256 of (timestamp + apiKey + recvWindow + queryString)
 *
 * Credentials: loginId = apiKey, passwordEnc decrypts to JSON { secret }
 */
import { createHmac } from 'crypto';
import type { RawBrokerTrade } from '../brokerSyncService';

const BASE       = 'https://api.bybit.com';
const RECV_WIN   = '5000';

function sign(ts: string, apiKey: string, queryString: string, secret: string): string {
  const payload = ts + apiKey + RECV_WIN + queryString;
  return createHmac('sha256', secret).update(payload).digest('hex');
}

async function bybitGet(path: string, apiKey: string, secret: string, params: Record<string, string> = {}): Promise<any> {
  const ts      = String(Date.now());
  const qs      = new URLSearchParams(params).toString();
  const sig     = sign(ts, apiKey, qs, secret);

  const res = await fetch(`${BASE}${path}?${qs}`, {
    headers: {
      'X-BAPI-API-KEY':     apiKey,
      'X-BAPI-TIMESTAMP':   ts,
      'X-BAPI-SIGN':        sig,
      'X-BAPI-RECV-WINDOW': RECV_WIN,
    },
  });

  const data = await res.json() as any;
  if (data.retCode !== 0) throw new Error(`ByBit ${path}: ${data.retMsg} (${data.retCode})`);
  return data.result;
}

export async function fetchBybitTrades(
  apiKey:  string,
  secret:  string,
  fromMs:  number,
  toMs:    number,
): Promise<RawBrokerTrade[]> {
  const trades: RawBrokerTrade[] = [];
  let cursor = '';

  // Paginate through all closing executions
  while (true) {
    const params: Record<string, string> = {
      category:  'linear',
      execType:  'Trade',
      startTime: String(fromMs),
      endTime:   String(toMs),
      limit:     '100',
    };
    if (cursor) params.cursor = cursor;

    const result = await bybitGet('/v5/execution/list', apiKey, secret, params);
    const list: any[] = result.list ?? [];

    for (const e of list) {
      // Only journal closing (reducing) executions
      if (e.closedSize && parseFloat(e.closedSize) > 0) {
        trades.push({
          externalId:  e.execId,
          symbol:      e.symbol,
          direction:   e.side === 'Buy' ? 'Long' : 'Short',
          lots:        parseFloat(e.execQty  ?? '0'),
          closePrice:  parseFloat(e.execPrice ?? '0'),
          closeTime:   parseInt(e.execTime),
          profit:      parseFloat(e.closedPnl ?? '0'),
          commission:  parseFloat(e.execFee  ?? '0') * -1,
          rawData:     e,
        });
      }
    }

    cursor = result.nextPageCursor ?? '';
    if (!cursor || list.length === 0) break;
  }

  return trades;
}
