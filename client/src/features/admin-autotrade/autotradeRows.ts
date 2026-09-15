/**
 * THE AUTOTRADE SCREEN'S ROWS: every order the auto-trader sent and every signal it did not act on, as
 * one list, newest first.
 *
 * His question, 2026-09-15: "Is autotrader even taking trades anymore?" Answering it needed the broker's
 * own order history, because a refusal lived only in a Telegram DM. `GET /api/admin/autotrade` now hands
 * back two things: the orders (`autotrade_orders`, each with the result of the trade it opened) and the
 * decisions the platform writes to `signal_events` (`signal_platform/execution/decision_log.py`).
 *
 * A PLACED decision is the same event as its order, so it is not shown twice. A CANCELLED decision is
 * attached to its order as the reason the order was withdrawn.
 */

export type AutotradeOrder = {
  order_id: string; signal_id: string | null; strategy: string | null; symbol: string; side: string;
  entry_price: string | null; stop_loss: string | null; take_profit: string | null; lots: string | null;
  placed_at: string; filled_at: string | null; fill_price: string | null; status: string | null;
  close_time: string | null; close_price: string | null; profit_loss: string | null;
};

export type AutotradeDecision = {
  id: string; signal_id: string | null; strategy: string; symbol: string; stage: string;
  detail: string | null; created_at: string;
};

export type AutotradeFeed = { days: number; orders: AutotradeOrder[]; decisions: AutotradeDecision[] };

export type Tone = 'good' | 'bad' | 'warn' | 'neutral' | 'accent';

export type AutotradeRow = {
  key: string; when: string; symbol: string; side: string | null; outcome: string; tone: Tone;
  entry: number | null; stop: number | null; target: number | null; lots: number | null; note: string;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** `detail` is JSON from `decision_log`. Anything that is not is kept as plain text. */
function parseDetail(detail: string | null): Record<string, unknown> {
  if (!detail) return {};
  try {
    const v = JSON.parse(detail);
    return v && typeof v === 'object' ? v : { reason: detail };
  } catch {
    return { reason: detail };
  }
}

/** The decisions that mean "no order went out". */
const NOT_PLACED: Record<string, { outcome: string; tone: Tone }> = {
  autotrade_refused: { outcome: 'Refused', tone: 'warn' },
  autotrade_rejected: { outcome: 'Broker refused', tone: 'bad' },
  autotrade_failed: { outcome: 'Failed', tone: 'bad' },
};

function orderOutcome(o: AutotradeOrder): { outcome: string; tone: Tone } {
  if (o.status === 'filled') {
    const pl = num(o.profit_loss);
    if (o.close_time && pl !== null) {
      const money = `${pl < 0 ? '−' : '+'}$${Math.abs(pl).toFixed(2)}`;
      return { outcome: `Closed ${money}`, tone: pl > 0 ? 'good' : pl < 0 ? 'bad' : 'neutral' };
    }
    return { outcome: 'Filled', tone: 'accent' };
  }
  if (o.status === 'cancelled') return { outcome: 'Withdrawn', tone: 'neutral' };
  if (o.status === 'rejected') return { outcome: 'Broker refused', tone: 'bad' };
  return { outcome: 'Resting', tone: 'accent' };
}

/** Prices to the pair's own precision: gold to cents, yen pairs to 3 places, the rest to 5. */
export function price(symbol: string, v: number | null): string {
  if (v === null) return '—';
  const s = symbol.toUpperCase();
  return v.toFixed(s.includes('XAU') ? 2 : s.includes('JPY') ? 3 : 5);
}

export function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function buildRows(feed: AutotradeFeed): AutotradeRow[] {
  const withdrawnBecause = new Map<string, string>();
  for (const d of feed.decisions) {
    if (d.stage !== 'autotrade_cancelled') continue;
    const f = parseDetail(d.detail);
    if (f.order) withdrawnBecause.set(String(f.order), String(f.reason ?? ''));
  }

  const rows: AutotradeRow[] = feed.orders.map(o => {
    const fill = num(o.fill_price);
    const note = o.status === 'cancelled'
      ? withdrawnBecause.get(o.order_id) || `order ${o.order_id}`
      : fill !== null ? `order ${o.order_id} · filled at ${price(o.symbol, fill)}` : `order ${o.order_id}`;
    return {
      key: `o-${o.order_id}-${o.placed_at}`, when: o.placed_at, symbol: o.symbol, side: o.side,
      ...orderOutcome(o), entry: num(o.entry_price), stop: num(o.stop_loss), target: num(o.take_profit),
      lots: num(o.lots), note,
    };
  });

  for (const d of feed.decisions) {
    const kind = NOT_PLACED[d.stage];
    if (!kind) continue;
    const f = parseDetail(d.detail);
    rows.push({
      key: `d-${d.id}`, when: d.created_at, symbol: d.symbol, side: f.side ? String(f.side) : null, ...kind,
      entry: num(f.entry), stop: num(f.stop), target: num(f.target), lots: num(f.lots),
      note: String(f.reason ?? ''),
    });
  }

  return rows.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
}

export function summarise(feed: AutotradeFeed) {
  const withStatus = (s: string) => feed.orders.filter(o => o.status === s).length;
  return {
    sent: feed.orders.length,
    filled: withStatus('filled'),
    withdrawn: withStatus('cancelled'),
    notPlaced: feed.decisions.filter(d => d.stage in NOT_PLACED).length,
  };
}
