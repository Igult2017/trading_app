/**
 * Bitunix adapter — USDT Perpetual Futures
 *
 * Auth: HMAC-SHA256(nonce + timestamp + apiKey + queryString, secret) → hex
 * Headers: api-key, sign, nonce, timestamp
 *
 * Credentials: loginId = apiKey, passwordEnc decrypts to JSON { secret }
 */
import { createHmac } from 'crypto';
import type { RawBrokerTrade } from '../brokerSyncService';

const BASE = 'https://fapi.bitunix.com';

function sign(nonce: string, ts: string, apiKey: string, qs: string, secret: string): string {
  const payload = nonce + ts + apiKey + qs;
  return createHmac('sha256', secret).update(payload).digest('hex');
}

async function bitunixGet(
  path:   string,
  apiKey: string,
  secret: string,
  params: Record<string, string> = {},
): Promise<any> {
  const ts    = String(Date.now());
  const nonce = Math.random().toString(36).substring(2, 10);
  const qs    = new URLSearchParams(params).toString();
  const sig   = sign(nonce, ts, apiKey, qs, secret);

  const res = await fetch(`${BASE}${path}?${qs}`, {
    headers: {
      'api-key':   apiKey,
      'sign':      sig,
      'nonce':     nonce,
      'timestamp': ts,
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json() as any;
  if (data.code !== 0) throw new Error(`Bitunix ${path}: ${data.msg} (${data.code})`);
  return data.data;
}

export async function fetchBitunixTrades(
  apiKey:  string,
  secret:  string,
  fromMs:  number,
  toMs:    number,
): Promise<RawBrokerTrade[]> {
  const trades: RawBrokerTrade[] = [];
  let page = 1;

  while (true) {
    const result = await bitunixGet('/api/v1/future/trade/get_history_orders', apiKey, secret, {
      page:      String(page),
      size:      '100',
      startTime: String(fromMs),
      endTime:   String(toMs),
      status:    'filled',
    });

    const list: any[] = result?.orderList ?? result?.list ?? [];

    for (const o of list) {
      if (o.reduceOnly !== true && o.closePosition !== true) continue;

      trades.push({
        externalId:  String(o.orderId ?? o.id),
        symbol:      o.symbol,
        direction:   o.side === 'BUY' ? 'Short' : 'Long', // buy closes a short position
        lots:        parseFloat(o.qty ?? o.size ?? '0'),
        closePrice:  parseFloat(o.avgPrice ?? o.price ?? '0'),
        closeTime:   parseInt(o.updateTime ?? o.cTime),
        profit:      parseFloat(o.profit ?? o.realizedPnl ?? '0'),
        commission:  parseFloat(o.fee ?? '0') * -1,
        rawData:     o,
      });
    }

    const total = result?.total ?? 0;
    if (list.length < 100 || trades.length >= total) break;
    page++;
  }

  return trades;
}
