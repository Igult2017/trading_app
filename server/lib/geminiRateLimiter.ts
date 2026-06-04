1/**
 * Gemini Free Tier Rate Limiter
 *
 * Official Google AI Studio free-tier limits (as of 2025):
 *   gemini-2.0-flash      → 15 RPM · 1,000,000 TPM · 1,500 RPD
 *   gemini-2.0-flash-lite → 30 RPM · 1,000,000 TPM · 1,500 RPD
 *   gemini-2.5-flash      → 10 RPM ·   250,000 TPM ·   500 RPD
 *   gemini-2.5-pro        →  5 RPM ·   250,000 TPM ·    25 RPD  ← avoid!
 *
 * Strategy: use gemini-2.0-flash everywhere for automation (best free tier).
 * This limiter enforces RPM via a 60-second sliding window and RPD via a
 * daily counter that resets at midnight UTC. Requests that arrive when the
 * window is full are queued (not dropped) and dispatched as soon as a slot
 * opens, up to MAX_WAIT_MS before the caller gets a timeout error.
 */

interface QueueItem {
  resolve: () => void;
  reject:  (err: Error) => void;
  enqueued: number;
}

const FREE_TIER = {
  RPM:         15,         // requests per minute (gemini-2.0-flash)
  RPD:       1_500,        // requests per day
  MAX_WAIT_MS: 60_000,     // max time a request waits in queue (60 s)
};

class GeminiRateLimiter {
  private timestamps: number[] = [];   // sliding window — last 60 s
  private dailyCount  = 0;
  private dailyReset  = this.nextMidnightUTC();
  private queue: QueueItem[] = [];
  private ticking = false;

  private nextMidnightUTC(): number {
    const d = new Date();
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  }

  private refreshDaily() {
    if (Date.now() >= this.dailyReset) {
      this.dailyCount = 0;
      this.dailyReset = this.nextMidnightUTC();
      console.log("[GeminiRL] Daily counter reset — new day.");
    }
  }

  /** Returns how many requests fired in the last 60 seconds. */
  private windowCount(): number {
    const cutoff = Date.now() - 60_000;
    this.timestamps = this.timestamps.filter(t => t > cutoff);
    return this.timestamps.length;
  }

  /** Milliseconds until the oldest window slot expires (0 = slot available). */
  private msUntilFree(): number {
    if (this.windowCount() < FREE_TIER.RPM) return 0;
    return Math.max(0, this.timestamps[0] + 60_000 - Date.now() + 50);
  }

  /**
   * Acquire one request slot.
   * Resolves immediately when under the rate limit.
   * Queues the request when at the limit; resolves once a slot opens.
   * Rejects after MAX_WAIT_MS or if the daily cap is hit.
   */
  async acquire(): Promise<void> {
    this.refreshDaily();

    if (this.dailyCount >= FREE_TIER.RPD) {
      const resets = new Date(this.dailyReset).toISOString();
      throw new Error(
        `Gemini daily limit reached (${FREE_TIER.RPD} req/day). Resets at ${resets} UTC.`
      );
    }

    const wait = this.msUntilFree();
    if (wait <= 0 && this.queue.length === 0) {
      this.timestamps.push(Date.now());
      this.dailyCount++;
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const item: QueueItem = { resolve, reject, enqueued: Date.now() };
      this.queue.push(item);

      const timer = setTimeout(() => {
        const i = this.queue.indexOf(item);
        if (i !== -1) {
          this.queue.splice(i, 1);
          reject(new Error(
            `Gemini request timed out after ${FREE_TIER.MAX_WAIT_MS / 1000}s in queue ` +
            `(${this.queue.length} still queued, ${this.windowCount()}/${FREE_TIER.RPM} RPM used)`
          ));
        }
      }, FREE_TIER.MAX_WAIT_MS);

      if ((item as any)._timer === undefined) (item as any)._timer = timer;

      this.scheduleTick();
    });
  }

  private scheduleTick() {
    if (this.ticking) return;
    this.ticking = true;
    this.tick();
  }

  private tick() {
    if (this.queue.length === 0) { this.ticking = false; return; }

    this.refreshDaily();
    const wait = this.msUntilFree();

    if (wait > 0) {
      console.log(
        `[GeminiRL] Rate limit reached — waiting ${(wait / 1000).toFixed(1)}s. ` +
        `Queue: ${this.queue.length} · Today: ${this.dailyCount}/${FREE_TIER.RPD}`
      );
      setTimeout(() => this.tick(), wait);
      return;
    }

    if (this.dailyCount >= FREE_TIER.RPD) {
      const err = new Error(`Gemini daily limit reached (${FREE_TIER.RPD}/day).`);
      while (this.queue.length) this.queue.shift()!.reject(err);
      this.ticking = false;
      return;
    }

    const item = this.queue.shift()!;
    clearTimeout((item as any)._timer);
    this.timestamps.push(Date.now());
    this.dailyCount++;
    item.resolve();

    if (this.queue.length > 0) {
      setImmediate(() => this.tick());
    } else {
      this.ticking = false;
    }
  }

  /** Current usage snapshot — handy for a status endpoint. */
  getStats() {
    this.refreshDaily();
    return {
      model:           "gemini-2.0-flash (free tier)",
      requestsPerMin:  { used: this.windowCount(),  limit: FREE_TIER.RPM },
      requestsPerDay:  { used: this.dailyCount,     limit: FREE_TIER.RPD },
      dailyRemaining:  FREE_TIER.RPD - this.dailyCount,
      minuteRemaining: Math.max(0, FREE_TIER.RPM - this.windowCount()),
      queueLength:     this.queue.length,
      dailyResetsAt:   new Date(this.dailyReset).toISOString(),
    };
  }
}

export const geminiRateLimiter = new GeminiRateLimiter();
