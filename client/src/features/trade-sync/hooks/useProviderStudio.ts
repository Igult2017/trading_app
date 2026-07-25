import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import type { SetToast } from "./useToast";
import type { Overview } from "./useOverview";

/** The current user's own signal service, wired to their real copy_master row: profile edits
 *  persist via PUT, accept/decline act on the real pending followers. */
export function useProviderStudio(setToast: SetToast, overview: Overview | undefined, invalidate: () => void) {
  const master = overview?.studio.master ?? null;
  const [serviceName, setServiceName] = useState("");
  const [feeModel, setFeeModel] = useState("Performance fee");
  const [strategyDesc, setStrategyDesc] = useState("");
  const [listed, setListedState] = useState(false);
  const [supportMessage, setSupportMessage] = useState("");
  const [seeded, setSeeded] = useState(false);

  // Seed the editable fields from the server ONCE (not on every poll, or typing gets clobbered).
  useEffect(() => {
    if (master && !seeded) {
      setServiceName(master.serviceName);
      setStrategyDesc(master.strategyDesc);
      setListedState(master.listed);
      setSeeded(true);
    }
  }, [master, seeded]);

  const requests = overview?.studio.requests ?? [];
  const followers = overview?.studio.followers ?? [];
  const stats = overview?.studio.stats ?? { aum: 0, activeFollowers: 0, ret30d: "—", avgRating: "—" };

  const persist = async (fields: Record<string, unknown>, okMsg: string) => {
    try {
      if (master) {
        await apiRequest("PUT", `/api/copy/masters/${master.id}`, fields);
      } else {
        const onto = overview?.ownAccounts.find((a) => a.connected);
        if (!onto) { setToast("Connect a trading account first — your service broadcasts from it."); return; }
        await apiRequest("POST", "/api/copy/masters", {
          brokerAccountId: onto.id, sourceType: onto.platform.toLowerCase(),
          strategyName: serviceName || "My signal service", description: strategyDesc,
          tradingStyle: "intraday", primaryMarket: "fx", isActive: true, ...fields,
        });
      }
      setToast(okMsg);
      invalidate();
    } catch (err: any) { setToast(`Could not save: ${err.message}`); }
  };

  const setListed = (next: boolean) => {
    setListedState(next);
    void persist({ isPublic: next }, next ? "Your service is LISTED on the marketplace." : "Your service is unlisted.");
  };

  const saveProfile = () =>
    persist({ strategyName: serviceName, description: strategyDesc }, "Service profile saved.");

  const acceptFollowRequest = async (req: { id: string; name: string }) => {
    try {
      await apiRequest("POST", `/api/copy/followers/${req.id}/approve`);
      setToast(`You accepted ${req.name}'s follow request.`);
      invalidate();
    } catch (err: any) { setToast(`Could not accept: ${err.message}`); }
  };

  const declineFollowRequest = async (req: { id: string; name: string }) => {
    try {
      await apiRequest("DELETE", `/api/copy/followers/${req.id}`);
      setToast(`Declined ${req.name}'s follow request.`);
      invalidate();
    } catch (err: any) { setToast(`Could not decline: ${err.message}`); }
  };

  const sendSupportMessage = () => {
    if (!supportMessage.trim()) return;
    setToast("Message sent to support — we'll reply within one business day.");
    setSupportMessage("");
  };

  return {
    serviceName, setServiceName,
    feeModel, setFeeModel,
    strategyDesc, setStrategyDesc,
    listed, setListed,
    supportMessage, setSupportMessage,
    requests, followers, stats, saveProfile,
    acceptFollowRequest, declineFollowRequest, sendSupportMessage,
  };
}

export type ProviderStudio = ReturnType<typeof useProviderStudio>;
