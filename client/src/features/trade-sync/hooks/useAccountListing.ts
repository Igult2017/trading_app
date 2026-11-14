import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";

/**
 * useAccountListing — list or unlist one of the user's live accounts in the FX Copier marketplace,
 * and save its public name/description. THE ONE WAY TO DO EITHER.
 *
 * MOVED HERE UNCHANGED from useProviderStudio on 2026-11-15, when the Settings page got the same
 * switch ("turn on or off ... listing of their live accounts in the copier"). Two copies of a
 * privacy switch is how one of them starts doing something different.
 *
 * `say` reports the outcome in words (a toast in the copier, an inline line on Settings);
 * `invalidate` refetches whatever list the caller shows.
 */
export function useAccountListing(say: (message: string) => void, invalidate: () => void) {
  const setToast = say;
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

  return { setAccountListed, saveAccountProfile, busyId };
}
