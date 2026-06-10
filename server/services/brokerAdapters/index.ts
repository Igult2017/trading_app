/**
 * Broker adapter dispatcher
 * Given a BrokerAccount (with decrypted credentials), fetches closed trades
 * for the specified date range and returns them as RawBrokerTrade[].
 */
import { safeDecrypt } from '../../lib/crypto';
import type { BrokerAccount } from '../../../shared/schema';
import type { RawBrokerTrade } from '../brokerSyncService';

import { fetchCTraderTrades      } from './ctrader';
import { fetchBinanceTrades       } from './binance';
import { fetchBybitTrades         } from './bybit';
import { fetchBitgetTrades        } from './bitget';
import { fetchCoinbaseTrades      } from './coinbase';
import { fetchBitunixTrades       } from './bitunix';
import { fetchDXTradeTrades       } from './dxtrade';
import { fetchTradeLockerTrades   } from './tradelocker';

/** Platforms that support API sync (not webhook). */
export const API_PLATFORMS = new Set([
  'ctrader', 'binance', 'bybit', 'bitget', 'coinbase', 'bitunix',
  'dxtrade', 'tradelocker',
]);

interface Creds {
  secret?:       string;
  passphrase?:   string;
  password?:     string;
  accessToken?:  string;
  refreshToken?: string;
  ctraderId?:    string;
}

function parseCreds(enc: string | null | undefined): Creds {
  const plain = safeDecrypt(enc);
  if (!plain) return {};
  try { return JSON.parse(plain) as Creds; } catch { return { secret: plain }; }
}

/**
 * Fetch trades from the right adapter.
 * fromMs / toMs are Unix milliseconds.
 */
export async function fetchTradesForAccount(
  account: BrokerAccount,
  fromMs:  number,
  toMs:    number,
): Promise<RawBrokerTrade[]> {
  const platform = account.platform.toLowerCase();
  const apiKey   = account.loginId;           // API key / cTrader account ID
  const creds    = parseCreds(account.passwordEnc);

  switch (platform) {
    case 'ctrader': {
      const { accessToken, ctraderId } = creds;
      if (!accessToken) throw new Error('cTrader: not connected. Complete OAuth first.');
      const id     = ctraderId ?? apiKey;
      const isLive = account.accountType?.toLowerCase() !== 'demo';
      return fetchCTraderTrades(accessToken, id, fromMs, toMs, isLive);
    }

    case 'binance': {
      if (!creds.secret) throw new Error('Binance: API secret missing.');
      return fetchBinanceTrades(apiKey, creds.secret, fromMs, toMs, account.server ?? undefined);
    }

    case 'bybit': {
      if (!creds.secret) throw new Error('ByBit: API secret missing.');
      return fetchBybitTrades(apiKey, creds.secret, fromMs, toMs);
    }

    case 'bitget': {
      if (!creds.secret)     throw new Error('Bitget: API secret missing.');
      if (!creds.passphrase) throw new Error('Bitget: passphrase missing.');
      return fetchBitgetTrades(apiKey, creds.secret, creds.passphrase, fromMs, toMs);
    }

    case 'coinbase': {
      if (!creds.secret) throw new Error('Coinbase: API secret missing.');
      return fetchCoinbaseTrades(apiKey, creds.secret, fromMs, toMs);
    }

    case 'bitunix': {
      if (!creds.secret) throw new Error('Bitunix: API secret missing.');
      return fetchBitunixTrades(apiKey, creds.secret, fromMs, toMs);
    }

    case 'dxtrade': {
      if (!creds.password) throw new Error('DXTrade: password missing.');
      const serverUrl = account.server;
      if (!serverUrl) throw new Error('DXTrade: broker API URL (server field) missing.');
      return fetchDXTradeTrades(serverUrl, apiKey, creds.password, fromMs, toMs);
    }

    case 'tradelocker': {
      if (!creds.password) throw new Error('TradeLocker: password missing.');
      const tlServer = account.server ?? '';
      return fetchTradeLockerTrades(apiKey, creds.password, tlServer, account.accountType ?? 'demo', fromMs, toMs);
    }

    default:
      throw new Error(`No API adapter for platform: ${platform}. Use EA webhook instead.`);
  }
}
