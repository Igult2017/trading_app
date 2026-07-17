import { useState } from "react";
import { INITIAL_PROVIDER_FOLLOWERS, INITIAL_PROVIDER_REQUESTS } from "../data/providerStudio";
import type { Follower, FollowRequest } from "../types";
import type { SetToast } from "./useToast";

/** The current user's own signal-service side of the business: listing, requests, followers. */
export function useProviderStudio(setToast: SetToast) {
  const [serviceName, setServiceName] = useState("Alex Warren Momentum Desk");
  const [feeModel, setFeeModel] = useState("Performance fee");
  const [strategyDesc, setStrategyDesc] = useState(
    "Momentum-based intraday setups on major FX pairs and metals, with a hard 1% per-trade risk cap."
  );
  const [listed, setListed] = useState(true);
  const [supportMessage, setSupportMessage] = useState("");
  const [requests, setRequests] = useState<FollowRequest[]>(INITIAL_PROVIDER_REQUESTS);
  const [followers, setFollowers] = useState<Follower[]>(INITIAL_PROVIDER_FOLLOWERS);

  const acceptFollowRequest = (req: FollowRequest) => {
    setRequests((prev) => prev.filter((r) => r.id !== req.id));
    setFollowers((prev) => [
      { id: req.id, name: req.name, handle: req.handle, allocation: req.allocation, joined: "Just now" },
      ...prev,
    ]);
    setToast(`You accepted ${req.name}'s follow request.`);
  };

  const declineFollowRequest = (req: FollowRequest) => {
    setRequests((prev) => prev.filter((r) => r.id !== req.id));
    setToast(`Declined ${req.name}'s follow request.`);
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
    requests, followers,
    acceptFollowRequest, declineFollowRequest, sendSupportMessage,
  };
}

export type ProviderStudio = ReturnType<typeof useProviderStudio>;
