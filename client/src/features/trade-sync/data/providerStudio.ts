import type { Feedback, Follower, FollowRequest, Stat } from "../types";

/** The current user's own signal service — the other side of the marketplace. */
export const PROVIDER_STATS: Stat[] = [
  { label: "AUM COPIED", value: "$186,420", sub: "across all followers" },
  { label: "ACTIVE FOLLOWERS", value: "27", sub: "+3 this week" },
  { label: "30D RETURN", value: "+9.1%", sub: "your service" },
  { label: "AVG RATING", value: "4.7", sub: "38 reviews" },
];

export const INITIAL_PROVIDER_REQUESTS: FollowRequest[] = [
  { id: "req-1", name: "Daniel Osei", handle: "@d.osei", allocation: "$4,000", time: "6m ago" },
  { id: "req-2", name: "Priya Nathan", handle: "@priyan_fx", allocation: "$12,500", time: "41m ago" },
  { id: "req-3", name: "Marcus Webb", handle: "@webbtrades", allocation: "$1,800", time: "2h ago" },
];

export const INITIAL_PROVIDER_FOLLOWERS: Follower[] = [
  { id: "flw-1", name: "Sara Lindqvist", handle: "@sara_l", allocation: "$8,200", joined: "Jun 28" },
  { id: "flw-2", name: "Tomasz Nowak", handle: "@t.nowak", allocation: "$3,050", joined: "Jun 14" },
];

export const PROVIDER_FEEDBACK: Feedback[] = [
  { id: 1, name: "Sara Lindqvist", rating: 5, comment: "Consistent execution and the risk controls actually hold up in fast markets.", date: "Jul 9" },
  { id: 2, name: "Tomasz Nowak", rating: 4, comment: "Good returns overall, would like a bit more communication around news events.", date: "Jul 2" },
];
