/**
 * ddEmpty.ts — the zeroed placeholder used when a session has no analysable trades.
 *
 * WHY IT EXISTS RATHER THAN A "no data" SCREEN. When the API has nothing to compute it returns
 * `{ success: true, drawdown: {} }`. Rendering one blank slate for that tells you nothing about what
 * the page would show; rendering the FULL structure against zeroes shows every section with its own
 * "nothing yet" row, so an empty session looks like an empty version of the real page.
 *
 * ⚠ IT MIRRORS `compute_drawdown`'s OWN EMPTY RETURN, key for key
 * (server/python/drawdown/core.py:57-88). If a block is added there, add it here too — a missing key
 * here is a crash on an empty session only, which is exactly the path least likely to be tested.
 */
export const EMPTY_DRAWDOWN = {
  topStats: { maxDrawdown: 0, avgDrawdown: 0, recoveryFactor: 0, trendAlignment: 0 },
  intelligence: {
    current: { ddPct: 0, inDrawdown: false, tradesSincePeak: 0, daysSincePeak: null,
               peakEquity: 0, currentEquity: 0 },
    underwater: { longestTrades: 0, longestDays: 0, avgRecoveryTrades: 0,
                  currentUnderwaterTrades: 0, episodes: 0 },
    series: [] as number[], byStrategy: [], byInstrument: [],
    byDirection: { bullish: { byStrategy: [], byInstrument: [] },
                   bearish: { byStrategy: [], byInstrument: [] } },
  },
  riskModel: { winRate: 0, payoff: 0, kellyPct: 0, expectedMaxLossStreak: 0,
               actualMaxLossStreak: 0, streakWithinExpectation: true,
               mae: { hasData: false, avgWinnerMae: 0, avgLoserMae: 0, ratio: 0, count: 0 } },
  monteCarlo: { hasData: false, runs: 0, actualMaxDd: 0, expectedMaxDd: 0, worstCase95: 0,
                worstCase99: 0, actualPercentile: 0, riskOfRuinPct: 0, ruinThreshold: -50,
                breach20Pct: 0 },
  recovery: { hasData: false, underwaterAvgSize: 0, baselineAvgSize: 0, sizeRatio: 0,
              underwaterCount: 0, baselineCount: 0, verdict: '', minSample: 4 },
  lossShare: { byPair: [], bySession: [] },
  structural: { context: [], entry: [] },
  sessions: [],
  streaks: { maxLossStreak: { length: 0, startDate: null, endDate: null }, avgLossStreak: 0,
             revengeRate: 0, bestWinStreak: { length: 0, startDate: null, endDate: null },
             timeline: [] },
  rrBuckets: [],
  monthly: [],
};
