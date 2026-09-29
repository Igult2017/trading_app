import type { Response } from 'express';

/**
 * TELL THE BROWSER A TRADE LANDED, INSTEAD OF LETTING IT ASK.
 *
 * WHY. Nothing pushed anything to a browser before this — verified 29 Sep, no socket server and no
 * event stream anywhere in `server/`. Every screen that wanted to stay current had to ask on a timer,
 * and the copier's overview asked every 20 seconds whether anything had happened, for every open tab,
 * for ever. At four users that is noise; at 250 it is the largest recurring cost in the app, and almost
 * all of it returns "nothing changed".
 *
 * ONLY THE AFFECTED USER IS TOLD. Connections are held per user id, so a trade on one account wakes
 * that person's tabs and nobody else's.
 *
 * WHY SERVER-SENT EVENTS AND NOT A WEBSOCKET. The traffic is one-directional — the server has news, the
 * browser has nothing to say back — and this rides on ordinary HTTP, so it needs no new port, no
 * upgrade handling and no second authentication path. A WebSocket would be a bigger surface for no gain.
 *
 * ⚠ CONNECTIONS LIVE IN THIS PROCESS ONLY. Production runs ONE Node process (`start.sh:69` is a plain
 * `node dist/index.prod.js`, not a cluster), so every connection and every push share it. If the app is
 * ever run as several instances, a push raised in one will NOT reach a browser attached to another, and
 * this needs a shared channel (PostgreSQL LISTEN/NOTIFY is already used elsewhere) before that happens.
 * Written down because it fails silently: the page simply stops updating for some users.
 */

interface Client {
  userId: string;
  res: Response;
  /** Cleared when the connection closes, so a dead socket stops being written to. */
  keepAlive: NodeJS.Timeout;
}

const clients = new Set<Client>();

/** How often to send a comment line so proxies and phones do not close an idle connection. */
const KEEPALIVE_MS = 25_000;

/** Nothing about a journal event is secret to its own user, but the payload is still kept minimal. */
export type JournalEvent =
  | { type: 'trade-recorded'; externalId?: string; symbol?: string; count?: number }
  | { type: 'trades-changed' };

function write(res: Response, line: string): boolean {
  try { res.write(line); return true; } catch { return false; }
}

/**
 * Attach one browser. The caller has already authenticated and knows whose connection this is.
 *
 * HEADERS MATTER HERE. Without `X-Accel-Buffering: no` a reverse proxy may hold the stream in a buffer
 * and deliver nothing until it fills — which looks exactly like a broken feature.
 */
export function subscribe(userId: string, res: Response): void {
  res.status(200).set({
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache, no-transform',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const client: Client = {
    userId,
    res,
    keepAlive: setInterval(() => {
      if (!write(res, ': keep-alive\n\n')) drop(client);
    }, KEEPALIVE_MS),
  };
  clients.add(client);

  // SAY HELLO IMMEDIATELY. The browser cannot tell "connected and quiet" from "never connected", and
  // a first byte is also what makes any buffering proxy commit to streaming.
  write(res, `event: ready\ndata: {"ok":true}\n\n`);

  res.on('close', () => drop(client));
  res.on('error', () => drop(client));
}

function drop(client: Client): void {
  clearInterval(client.keepAlive);
  clients.delete(client);
  try { client.res.end(); } catch { /* already gone */ }
}

/**
 * Wake one user's open tabs.
 *
 * DELIBERATELY NOT AWAITED BY CALLERS AND NEVER THROWS. This is told about a trade AFTER the trade is
 * safely stored, so a failure here must not be able to affect recording. A trade that is saved but not
 * announced is a stale screen; a trade that is announced but not saved does not exist.
 */
export function pushToUser(userId: string, event: JournalEvent): void {
  if (!clients.size) return;
  const frame = `event: journal\ndata: ${JSON.stringify(event)}\n\n`;
  let sent = 0;
  for (const c of [...clients]) {
    if (c.userId !== userId) continue;
    if (write(c.res, frame)) sent++; else drop(c);
  }
  if (sent) console.log(`[JournalPush] ${event.type} -> ${sent} open tab(s) for user ${userId.slice(0, 8)}`);
}
