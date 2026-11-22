/** Trade Sync — shared UI types. Presentation only; nothing here is wired to an API yet. */

/** Lifecycle of a broker-account link, follower side and provider side alike. */
export type AccountStatus = "disconnected" | "connecting" | "connected";

/** A follow request to a marketplace provider: absent -> "pending" -> "following". */
export type FollowStatus = "pending" | "following";

export type SourceId = "provider" | "self-copy" | "telegram";

export type PageId = "dashboard" | "copy" | "self" | "telegram" | "provider" | "history";

export interface NavItem {
  id: PageId;
  label: string;
  icon?: string;
  telegram?: boolean;
}

export interface ActivityItem {
  text: string;
  time: string;
}

export interface Kpi {
  label: string;
  value: string;
  delta?: string;
  positive?: boolean;
  sub?: string;
}

export interface Source {
  id: SourceId;
  title: string;
  desc: string;
  options: string[];
  icon?: string;
  telegram?: boolean;
}

export interface CopyAccount {
  id: number;
  name: string;
  handle: string;
  tag: string;
  /** Dollar PnL where it truly exists; null when the backend has no honest figure ("—" in the UI). */
  pnl: number | null;
  status: "live" | "paused";
  /** Real copy_followers row id — what pause/resume mutations act on. */
  followerId?: string;
  masterId?: string;
}

/** ONE COPIED TRADE (22 Nov 2026) — all its actions (open, stop moves, partial close, close) folded together on the
 *  server (`server/lib/copyFeed.ts`). It was one row per action, so one trade showed up many times. */
export interface FeedRow {
  id: number;
  side: "BUY" | "SELL";
  symbol: string;
  account: string;                 // the follower account it was copied to
  lot: string;
  entry: string | null;
  close: string | null;
  status: "open" | "partly closed" | "closed" | "order" | "cancelled";
  stopMoves: number;
  ms: number | null;               // how long the copy that opened it took
  time: string;                    // last change, "5m ago"
}

/** One line of Recent activity — each action named for what it was. */
export interface ActivityRow { text: string; time: string }

export interface Provider {
  id: string;
  name: string;
  handle: string;
  verified: boolean;
  rating: number;
  winRate: number;
  monthlyReturn: string;
  followers: string;
  risk: "Low" | "Medium" | "High";
}

export interface OwnAccount {
  id: string;
  name: string;
  platform: string;
  broker: string;
  balance: string;
}

export interface TradeRow {
  id: number;
  date: string;
  symbol: string;
  side: "BUY" | "SELL";
  lot: string;
  source: string;
  pnl: number | null;
}

export interface Stat {
  label: string;
  value: string;
  sub: string;
}

export interface FollowRequest {
  id: string;
  name: string;
  handle: string;
  allocation: string;
  time: string;
}

export interface Follower {
  id: string;
  name: string;
  handle: string;
  allocation: string;
  joined: string;
}

export interface Feedback {
  id: number;
  name: string;
  rating: number;
  comment: string;
  date: string;
}
