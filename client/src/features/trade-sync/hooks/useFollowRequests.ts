import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import type { FollowStatus, Provider } from "../types";
import type { SetToast } from "./useToast";
import type { Overview } from "./useOverview";
import type { CopySetup } from "./useCopySetup";

/**
 * Following a provider is REAL now: POST /masters/:id/subscribe creates a follower (pending when
 * the provider requires approval), un/withdraw DELETEs it. Status is server truth (overview) with
 * a thin optimistic layer so the button reacts instantly.
 */
export function useFollowRequests(
  setToast: SetToast,
  overview: Overview | undefined,
  invalidate: () => void,
  setup: Pick<CopySetup, "lotFields" | "ownAccounts">,
) {
  const [optimistic, setOptimistic] = useState<Record<string, FollowStatus | null>>({});

  const followStatus: Record<string, FollowStatus> = {};
  for (const [masterId, v] of Object.entries(overview?.followStatus ?? {})) followStatus[masterId] = v.status;
  for (const [masterId, v] of Object.entries(optimistic)) {
    if (v === null) delete followStatus[masterId];
    else followStatus[masterId] = v;
  }

  const toggleFollow = async (provider: Provider & { requireApproval?: boolean }) => {
    const current = followStatus[provider.id];
    try {
      if (!current) {
        const onto = setup.ownAccounts.find((a) => a.connected);
        if (!onto) { setToast("Connect a trading account first — the copies need somewhere to land."); return; }
        setOptimistic((p) => ({ ...p, [provider.id]: provider.requireApproval ? "pending" : "following" }));
        const res = await (await apiRequest("POST", `/api/copy/masters/${provider.id}/subscribe`, {
          brokerAccountId: onto.id, riskAccepted: true, ...setup.lotFields(),
        })).json();
        setToast(res.message ?? `Follow request sent to ${provider.name}.`);
      } else {
        const followerId = overview?.followStatus[provider.id]?.followerId;
        setOptimistic((p) => ({ ...p, [provider.id]: null }));
        if (followerId) await apiRequest("DELETE", `/api/copy/followers/${followerId}`);
        setToast(current === "pending" ? `Follow request to ${provider.name} withdrawn.` : `Unfollowed ${provider.name}.`);
      }
      invalidate();
    } catch (err: any) {
      setOptimistic((p) => ({ ...p, [provider.id]: null }));
      setToast(`Follow action failed: ${err.message}`);
      invalidate();
    }
  };

  return { followStatus, toggleFollow };
}
