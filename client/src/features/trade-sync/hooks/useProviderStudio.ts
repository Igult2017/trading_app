import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import type { SetToast } from "./useToast";
import type { Overview } from "./useOverview";
import { useAccountListing } from "./useAccountListing";

/** The current user's own signal service, wired to their real copy_master row: profile edits
 *  persist via PUT, accept/decline act on the real pending followers. */
export function useProviderStudio(setToast: SetToast, overview: Overview | undefined, invalidate: () => void) {
  // THE SINGLE-SERVICE PATH IS GONE (2026-09-29). It held one name, one description and one
  // "listed" flag for the whole user, attached to whichever account `ownAccounts.find(a =>
  // a.connected)` happened to return first — so with four accounts he could publish exactly one and
  // not choose which. `persist`, `setListed`, `saveProfile` and the seeding effect went with it;
  // every one of them is now per account, below.
  const [supportMessage, setSupportMessage] = useState("");
  const [sending, setSending] = useState(false);

  // LISTING LIVES IN useAccountListing since 2026-11-15 — the Settings page uses the same switch.
  const accounts = overview?.studio.accounts ?? [];
  const { setAccountListed, saveAccountProfile, busyId } = useAccountListing(setToast, invalidate);

  const requests = overview?.studio.requests ?? [];
  const followers = overview?.studio.followers ?? [];
  const stats = overview?.studio.stats ?? { aum: 0, activeFollowers: 0, ret30d: "—", avgRating: "—" };

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
    accounts, setAccountListed, saveAccountProfile, busyId,
    supportMessage, setSupportMessage, sending,
    requests, followers, stats,
    acceptFollowRequest, declineFollowRequest, sendSupportMessage,
  };
}

export type ProviderStudio = ReturnType<typeof useProviderStudio>;
