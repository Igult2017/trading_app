import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/queryClient";
import type { CopyAccount, FeedRow, Provider, OwnAccount, TradeRow, FollowRequest, Follower } from "../types";

/** The ONE server payload the whole panel renders from — GET /api/copy/overview. */
export interface Overview {
  kpis: { totalEquity: number; todayPnl: number; activeCopies: number; masters: number; tradesToday: number };
  copies: (CopyAccount & { followerId: string; masterId: string })[];
  feed: FeedRow[];
  ownAccounts: (OwnAccount & { connected: boolean; loginId: string; isCtrader: boolean })[];
  providers: (Provider & { requireApproval: boolean })[];
  followStatus: Record<string, { followerId: string; status: "pending" | "following" }>;
  studio: {
    master: { id: string; serviceName: string; strategyDesc: string; listed: boolean } | null;
    stats: { aum: number; activeFollowers: number; ret30d: string; avgRating: string };
    requests: FollowRequest[];
    followers: Follower[];
  };
  history: { trades: TradeRow[]; stats: { winRate: string; profitFactor: string; maxDrawdown: string; totalTrades: string } };
  mirroring: boolean;
  /** The self-copy setup as it is SAVED in the database — what the panel restores itself from on
   *  load. Null until he has pressed Start once. Included even when paused, so stopping mirroring
   *  does not blank the panel and strand him with no way to see or restart what he configured. */
  selfCopy: {
    masterBrokerAccountId: string | null;
    mirrorBrokerAccountIds: string[];
    lotMode: string | null;
    lotMultiplier: string | null;
    fixedLot: string | null;
    riskPercent: string | null;
    maxDdPercent: string | null;
    symbolWhitelist: string[];
    activeSessions: string[];
    riskAccepted: boolean;
  } | null;
}

export const OVERVIEW_KEY = ["/api/copy/overview"];

export function useOverview() {
  const qc = useQueryClient();
  const q = useQuery<Overview>({
    queryKey: OVERVIEW_KEY,
    queryFn: () => fetchJson<Overview>("/api/copy/overview"),
    refetchInterval: 20_000,      // the mirror feed + statuses stay live without a socket
    staleTime: 10_000,
  });
  return { ...q, invalidate: () => qc.invalidateQueries({ queryKey: OVERVIEW_KEY }) };
}
