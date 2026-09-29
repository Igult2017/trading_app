import { useEffect, useRef } from "react";
import { authFetch, queryClient } from "@/lib/queryClient";

/**
 * KEEP THE PAGE CURRENT BY BEING TOLD, NOT BY ASKING.
 *
 * The server holds this connection open and writes down it when this user's journal changes
 * (`GET /api/journal/stream`, see server/services/journalPush.ts). On each message the affected queries
 * are refetched — so a trade appears within a second of the broker reporting it, instead of on the next
 * timer, and nothing is requested at all while nothing is happening.
 *
 * ⚠ WHY NOT `EventSource`. The browser's built-in EventSource cannot send an Authorization header, and
 * this app authenticates with a bearer token. The usual workaround is putting the token in the query
 * string, which writes it into every access and proxy log on the way. So the stream is read with
 * `fetch` — via `authFetch`, which already attaches the token the same way every other request does, so
 * there is no second copy of the auth logic to drift.
 *
 * IT IS A SUPPLEMENT, NOT A REPLACEMENT FOR CORRECTNESS. If this connection is down, the data is still
 * correct on the next fetch — a page load, a tab focus, or a remaining timer. So a failure here makes
 * the screen slower, never wrong, and that is why nothing below retries aggressively or reports an
 * error to the user.
 */

/** Queries that a recorded trade makes stale. Kept deliberately short — broad invalidation on a busy
 *  account would refetch the whole journal repeatedly and undo the point of the exercise. */
const AFFECTED = [
  ["/api/copy/overview"],
  ["/api/trades"],
  ["/api/journal/entries"],
  ["/api/notifications"],
];

export function useJournalStream(enabled = true): void {
  // Survives re-renders so a parent re-rendering cannot open a second stream.
  const running = useRef(false);

  useEffect(() => {
    if (!enabled || running.current) return;
    running.current = true;
    const abort = new AbortController();
    let stopped = false;
    // Grows on repeated failure so a server that is down is not hammered by every open tab.
    let backoffMs = 2_000;

    const invalidate = () => {
      for (const key of AFFECTED) queryClient.invalidateQueries({ queryKey: key });
    };

    const read = async (): Promise<void> => {
      const res = await authFetch("/api/journal/stream", { signal: abort.signal });
      if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
      backoffMs = 2_000;                         // a connection that opened resets the backoff
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done || stopped) return;
        buffer += decoder.decode(value, { stream: true });
        // Events are separated by a blank line. A chunk can split one in half, so only whole events are
        // consumed and the remainder is left in the buffer for the next chunk.
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (part.startsWith(":")) continue;               // keep-alive comment
          if (/^event:\s*journal$/m.test(part)) invalidate();
        }
      }
    };

    const loop = async (): Promise<void> => {
      while (!stopped) {
        try {
          await read();
        } catch {
          if (stopped) return;
        }
        // Reconnect: the server restarts on every deploy, so dropping out is normal, not exceptional.
        await new Promise(r => setTimeout(r, backoffMs));
        backoffMs = Math.min(backoffMs * 2, 60_000);
      }
    };
    void loop();

    return () => {
      stopped = true;
      running.current = false;
      abort.abort();
    };
  }, [enabled]);
}
