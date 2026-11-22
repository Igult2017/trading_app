/**
 * THE COPIER'S FEED, ONE ROW PER COPIED TRADE (22 Nov 2026).
 *
 * His report: the Mirror feed showed "SELL GBPUSD 1.20 lot @ 1.30778 · 3130ms to copy" eight times. The feed was every
 * EXECUTED COPY ACTION — the open, every stop move, every partial close, the close — each drawn as if it were a new
 * trade, never saying which action it was. Recent activity and the History tab re-used the same rows the same way.
 *
 * Here the actions of one copied trade (one follower account × one master trade) are folded into ONE row, and the
 * activity list names each action for what it was. Pure: the overview route hands in the rows, tests hand in theirs.
 */

/** One executed follower action, as the overview query returns it. */
export interface CopyAction {
  followerId: string;
  masterKey: string | null;      // the master trade it copies (position or order id); null = not linked
  event: string;                 // OPEN | PLACED | MODIFY | AMENDED | REDUCE | CLOSE | CANCELLED
  side: string;                  // BUY | SELL
  symbol: string;
  volume: number;
  entry: number | null;
  closed: number | null;
  at: string | Date;
  ms: number | null;             // master -> follower delay of this action
  account: string | null;        // the follower account's name
}

export type CopyStatus = 'open' | 'partly closed' | 'closed' | 'order' | 'cancelled';

export interface CopiedTrade {
  key: string;
  side: 'BUY' | 'SELL';
  symbol: string;
  account: string;
  lot: number;                   // the size it was copied at
  entry: number | null;
  close: number | null;
  status: CopyStatus;
  stopMoves: number;             // stop / target changes copied on it
  copyMs: number | null;         // delay of the copy that opened it
  openedAt: Date;
  updatedAt: Date;
}

export interface ActivityLine { text: string; at: Date; }

const SIDE = (s: string): 'BUY' | 'SELL' => (s === 'SELL' ? 'SELL' : 'BUY');

/** Fold actions (any order) into one row per copied trade, newest activity first, open trades before closed. */
export function foldTrades(actions: CopyAction[]): CopiedTrade[] {
  const byKey = new Map<string, CopiedTrade>();
  const sorted = [...actions].sort((a, b) => +new Date(a.at) - +new Date(b.at));
  for (const a of sorted) {
    // An action not linked to a master trade cannot be grouped — it stands alone rather than merging with others.
    const key = `${a.followerId}|${a.masterKey ?? `solo-${+new Date(a.at)}`}`;
    const at = new Date(a.at);
    let t = byKey.get(key);
    if (!t) {
      t = { key, side: SIDE(a.side), symbol: a.symbol, account: a.account || 'Follower', lot: a.volume || 0,
            entry: a.entry, close: null, status: 'open', stopMoves: 0, copyMs: null, openedAt: at, updatedAt: at };
      byKey.set(key, t);
    }
    t.updatedAt = at;
    switch (a.event) {
      case 'OPEN':
        t.lot = a.volume || t.lot; t.entry = a.entry ?? t.entry; t.openedAt = at; t.copyMs = a.ms;
        if (t.status === 'order') t.status = 'open';
        break;
      case 'PLACED':
        t.status = 'order'; t.lot = a.volume || t.lot; t.entry = a.entry ?? t.entry; t.copyMs = a.ms; break;
      case 'MODIFY': case 'AMENDED':
        t.stopMoves += 1; break;
      case 'REDUCE':
        if (t.status === 'open') t.status = 'partly closed'; break;
      case 'CLOSE':
        t.status = 'closed'; t.close = a.closed ?? t.close; break;
      case 'CANCELLED':
        t.status = 'cancelled'; break;
    }
  }
  const live = (s: CopyStatus) => (s === 'open' || s === 'partly closed' || s === 'order' ? 0 : 1);
  return [...byKey.values()].sort((a, b) => live(a.status) - live(b.status) || +b.updatedAt - +a.updatedAt);
}

/** The latest actions, each named for what it was — not every one called "Copied". */
export function activityLines(actions: CopyAction[], limit = 6): ActivityLine[] {
  return [...actions].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, limit).map((a) => {
    const on = a.account ? ` (${a.account})` : '';
    const lots = `${Number(a.volume || 0).toFixed(2)} lot`;
    const text = ({
      OPEN: `Copied ${SIDE(a.side)} ${a.symbol} ${lots}${on}`,
      PLACED: `Placed a ${SIDE(a.side)} ${a.symbol} order, ${lots}${on}`,
      MODIFY: `Moved the stop / target on ${a.symbol}${on}`,
      AMENDED: `Moved the pending ${a.symbol} order${on}`,
      REDUCE: `Partly closed ${a.symbol}, ${lots}${on}`,
      CLOSE: `Closed ${a.symbol}${on}`,
      CANCELLED: `Cancelled the pending ${a.symbol} order${on}`,
    } as Record<string, string>)[a.event] ?? `${a.event} ${a.symbol}${on}`;
    return { text, at: new Date(a.at) };
  });
}
