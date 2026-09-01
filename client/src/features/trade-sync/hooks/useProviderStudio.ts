import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import type { SetToast } from "./useToast";
import type { Overview } from "./useOverview";

/** The current user's own signal service, wired to their real copy_master row: profile edits
 *  persist via PUT, accept/decline act on the real pending followers. */
export function useProviderStudio(setToast: SetToast, overview: Overview | undefined, invalidate: () => void) {
  const master = overview?.studio.master ?? null;
  const [serviceName, setServiceName] = useState("");
  // A "fee model" dropdown (Performance fee / Flat subscription / Free) used to live here. It was
  // never sent, never loaded, and `copy_masters` HAS NO FEE COLUMN — so it reset on every reload,
  // and had it been stored it would have advertised a charging model that nothing charges. Removed
  // rather than persisted; it comes back when there is billing behind it.
  const [strategyDesc, setStrategyDesc] = useState("");
  const [listed, setListedState] = useState(false);
  const [supportMessage, setSupportMessage] = useState("");
  const [sending, setSending] = useState(false);
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
      // NOT `DELETE /api/copy/followers/:id`. That route asks whether the follower row belongs to
      // the caller — true for someone cancelling their own subscription, false for a provider
      // declining a stranger — so this button returned 403 for every real request while Accept,
      // beside it, worked. The decline route asks the same question Accept does: do you own the
      // master?
      await apiRequest("POST", `/api/copy/followers/${req.id}/decline`);
      setToast(`Declined ${req.name}'s follow request.`);
      invalidate();
    } catch (err: any) { setToast(`Could not decline: ${err.message}`); }
  };

  /** Sends for real, and only says so when it did — see POST /api/copy/support-message. */
  const sendSupportMessage = async () => {
    const text = supportMessage.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await apiRequest("POST", "/api/copy/support-message", { message: text });
      setToast("Message sent to support — we'll reply within one business day.");
      setSupportMessage("");
    } catch (err: any) {
      // The message stays in the box on failure: it is his only copy of what he typed.
      setToast(`Could not send: ${err.message}`);
    } finally { setSending(false); }
  };

  return {
    serviceName, setServiceName,
    strategyDesc, setStrategyDesc,
    listed, setListed,
    supportMessage, setSupportMessage, sending,
    requests, followers, stats, saveProfile,
    acceptFollowRequest, declineFollowRequest, sendSupportMessage,
  };
}

export type ProviderStudio = ReturnType<typeof useProviderStudio>;
