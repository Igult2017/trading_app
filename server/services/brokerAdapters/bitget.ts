/**
 * Bitget adapter — USDT Futures
 *
 * Auth: HMAC-SHA256(timestamp + METHOD + requestPath + body) → base64
 * Headers: ACCESS-KEY, ACCESS-SIGN, ACCESS-TIMESTAMP, ACCESS-PASSPHRASE
 *
 * Credentials: loginId = apiKey
 *   passwordEnc decrypts to JSON: { secret: "...", passphrase: "..." }
 */
import { createHmac } from 'crypto';
import type { RawBrokerTrade } from '../brokerSyncService';

const BASE = 'https://api.bitget.com';

function sign(ts: string, method: string, path: string, body: string, secret: string): string {
  const payload = ts + method.toUpperCase() + path + body;
  return createHmac('sha256', secret).update(payload).digest('base64');
}

async function bitgetGet(
  path:       string,
  apiKey:     string,
  secret:     string,
  passphrase: string,
  params:     Record<string, string> = {},
): Promise<any> {
  const ts  = String(Date.now());
  const qs  = new URLSearchParams(params).toString();
  const fullPath = qs ? `${path}?${qs}` : path;
  const sig = sign(ts, 'GET', fullPath, '', secret);

  const res = await fetch(`${BASE}${fullPath}`, {
    headers: {
      'ACCESS-KEY':        apiKey,
      'ACCESS-SIGN':       sig,
      'ACCESS-TIMESTAMP':  ts,
      'ACCESS-PASSPHRASE': passphrase,
      'Content-Type':      'application/json',
      'locale':            'en-US',
    },
  });

  const data = await res.json() as any;
  if (data.code !== '00000') throw new Error(`Bitget ${path}: ${data.msg} (${data.code})`);
  return data.data;
}

export async function fetchBitgetTrades(
  apiKey:     string,
  secret:     string,
  passphrase: string,
  fromMs:     number,
  toMs:       number,
): Promise<RawBrokerTrade[]> {
  const trades: RawBrokerTrade[] = [];
  let idLessThan = '';

  while (true) {
    const params: Record<string, string> = {
      productType: 'USDT-FUTURES',
      startTime:   String(fromMs),
      endTime:     String(toMs),
      limit:       '100',
    };
    if (idLessThan) params.idLessThan = idLessThan;

    const result = await bitgetGet('/api/v2/mix/order/fill-history', apiKey, secret, passphrase, params);
    const list: any[] = result?.fillList ?? result ?? [];

    for (const f of list) {
      // Only process closing fills (side ends in '_close')
      if (!f.side?.includes('close') && !f.reduceOnly) continue;

      trades.push({
        externalId:  String(f.tradeId ?? f.fillId),
        symbol:      f.symbol,
        direction:   f.side?.includes('buy') ? 'Short' : 'Long', // buy_close = closing short
        lots:        parseFloat(f.baseVolume ?? f.size ?? '0'),
        closePrice:  parseFloat(f.price ?? '0'),
        closeTime:   parseInt(f.cTime ?? f.fillTime),
        profit:      parseFloat(f.profit ?? '0'),
        commission:  parseFloat(f.fee ?? '0') * -1,
        rawData:     f,
      });
    }

    if (list.length < 100) break;
    idLessThan = list[list.length - 1]?.tradeId ?? list[list.length - 1]?.fillId ?? '';
    if (!idLessThan) break;
  }

  return trades;
}
