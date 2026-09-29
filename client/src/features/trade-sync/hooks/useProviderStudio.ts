import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import type { SetToast } from "./useToast";
import type { Overview } from "./useOverview";

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

  // ── ONE LISTING PER ACCOUNT (his instruction, 2026-09-29) ───────────────────────────────────
  //
  // *"list all the ctrader accounts that user has so that he can choose which ones to list to
  //  public to be followed... I should be able to list and unlist all of them."*
  //
  // THE SERVER ALREADY HAD THE RIGHT ENDPOINT and no new one was written:
  // `POST /api/broker-accounts/:id/register-as-provider` is keyed on the broker account, checks he
  // owns it, refuses a non-API platform, and creates-or-updates exactly one master for it. Listing
  // and unlisting are the same call with `isPublic` true or false — the marketplace joins on that
  // one field, so nothing else decides visibility.
  //
  // PER-ACCOUNT NAME AND DESCRIPTION, not one shared pair: four accounts listed under one name
  // would show the marketplace four identical providers, and `copy_masters` already stores both
  // per row. `strategyName` falls back to the account's own name so a listing is never nameless.
  const accounts = overview?.studio.accounts ?? [];
  const [busyId, setBusyId] = useState<string | null>(null);

  const setAccountListed = async (
    acct: { id: string; name: string; apiConnected: boolean; serviceName: string; description: string },
    next: boolean,
  ) => {
    if (busyId) return;
    if (next && !acct.apiConnected) {
      setToast(`${acct.name} is not API-connected, so followers could not be mirrored from it.`);
      return;
    }
    setBusyId(acct.id);
    try {
      await apiRequest("POST", `/api/broker-accounts/${acct.id}/register-as-provider`, {
        isPublic: next,
        strategyName: acct.serviceName || acct.name,
        description: acct.description,
      });
      setToast(next ? `${acct.name} is LISTED — other users can find and follow it.`
                    : `${acct.name} is unlisted. Nobody else can see it.`);
      invalidate();
    } catch (err: any) { setToast(`Could not change ${acct.name}: ${err.message}`); }
    finally { setBusyId(null); }
  };

  /** Save one account's public name and description without changing whether it is listed. */
  const saveAccountProfile = async (
    acct: { id: string; name: string; listed: boolean },
    serviceName: string, description: string,
  ) => {
    if (busyId) return;
    setBusyId(acct.id);
    try {
      await apiRequest("POST", `/api/broker-accounts/${acct.id}/register-as-provider`, {
        // `isPublic` IS SENT EVERY TIME, and deliberately. The endpoint reads it as
        // `b.isPublic === true`, so omitting it would quietly UNLIST an account the moment he
        // edited its description.
        isPublic: acct.listed,
        strategyName: serviceName || acct.name,
        description,
      });
      setToast(`Saved ${acct.name}.`);
      invalidate();
    } catch (err: any) { setToast(`Could not save ${acct.name}: ${err.message}`); }
    finally { setBusyId(null); }
  };

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
