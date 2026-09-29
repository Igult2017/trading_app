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
    /** EVERY account he owns, with its own listing state — his rule, 2026-09-29: "list all the
     *  ctrader accounts that user has... I should be able to list and unlist all of them."
     *
     *  ⚠ NOT the same list as `ownAccounts`, which is filtered on the copier gate. An account
     *  switched off for self-copying must still be listable here. */
    accounts: {
      id: string; name: string; platform: string; loginId: string | null;
      balance: string;
      /** Only an API-connected account can be mirrored from, so only one can be listed. */
      apiConnected: boolean;
      masterId: string | null;
      /** `is_public` — the ONE field the marketplace joins on. */
      listed: boolean;
      serviceName: string; description: string;
    }[];
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
    /** ONE ROW PER LINK, because he can have several masters at once — "master A copied by slave B
     *  and master D copied by slave E", and one slave may follow several masters. This replaced a
     *  single `masterBrokerAccountId` plus a flat `mirrorBrokerAccountIds`, which reported
     *  "A copies to B and E" as soon as a second master existed. */
    links: {
      followerId: string;
      masterAccountId: string;
      followerAccountId: string;
      isActive: boolean;
      lotMode: string | null;
      lotMultiplier: string | null;
      fixedLot: string | null;
      riskPercent: string | null;
    }[];
    /** The settings he chose last, so a NEW link starts from those rather than a hardcoded
     *  default. Not a property of any one link. */
    defaults: {
      lotMode: string | null;
      lotMultiplier: string | null;
      fixedLot: string | null;
      riskPercent: string | null;
      maxDdPercent: string | null;
      symbolWhitelist: string[];
      activeSessions: string[];
      riskAccepted: boolean;
    };
  } | null;
}

export const OVERVIEW_KEY = ["/api/copy/overview"];

export function useOverview() {
  const qc = useQueryClient();
  const q = useQuery<Overview>({
    queryKey: OVERVIEW_KEY,
    queryFn: () => fetchJson<Overview>("/api/copy/overview"),
    // THE 20-SECOND TIMER IS GONE (30 Sep). It read "the mirror feed + statuses stay live without a
    // socket" — and there now IS one: the server pushes when this user's journal changes
    // (useJournalStream), so this asked every 20 seconds, per open tab, for ever, and almost every
    // answer was "nothing changed".
    //
    // A SLOW FALLBACK IS KEPT, NOT ZERO. The push only makes the screen faster; it must never be the
    // only thing that can make it correct. Five minutes is invisible as load and still recovers a tab
    // whose stream died quietly.
    refetchInterval: 5 * 60_000,
    staleTime: 10_000,
  });
  return { ...q, invalidate: () => qc.invalidateQueries({ queryKey: OVERVIEW_KEY }) };
}
