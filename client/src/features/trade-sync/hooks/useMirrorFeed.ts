import type { FeedRow } from "../types";
import type { Overview } from "./useOverview";

/** The REAL mirror feed — executed follower trades with measured master→follower latency,
 *  refreshed by the overview poll. Nothing is synthesised. */
export function useMirrorFeed(overview: Overview | undefined): FeedRow[] {
  return overview?.feed ?? [];
}
