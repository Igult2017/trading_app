import { useEffect, useRef, useState } from "react";
import type { FollowStatus, Provider } from "../types";
import type { SetToast } from "./useToast";

/**
 * Following a marketplace provider is a REQUEST, not an instant switch — it sits as "pending"
 * until the provider accepts (simulated here with a 4s timer), same as a real follow-request.
 * Self-copy and Telegram never come through here: there is no other person to grant access.
 */
export function useFollowRequests(setToast: SetToast) {
  const [followStatus, setFollowStatus] = useState<Record<string, FollowStatus>>({});
  const followTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const toggleFollow = (provider: Provider) => {
    const current = followStatus[provider.id];

    if (!current) {
      setFollowStatus((prev) => ({ ...prev, [provider.id]: "pending" }));
      setToast(`Follow request sent to ${provider.name} — waiting for their approval.`);
      followTimers.current[provider.id] = setTimeout(() => {
        setFollowStatus((prev) => {
          if (prev[provider.id] !== "pending") return prev; // withdrawn before it was accepted
          return { ...prev, [provider.id]: "following" };
        });
        setToast(`${provider.name} accepted your follow request.`);
      }, 4000);
      return;
    }

    if (current === "pending") {
      clearTimeout(followTimers.current[provider.id]);
      setFollowStatus((prev) => {
        const next = { ...prev };
        delete next[provider.id];
        return next;
      });
      setToast(`Follow request to ${provider.name} withdrawn.`);
      return;
    }

    setFollowStatus((prev) => {
      const next = { ...prev };
      delete next[provider.id];
      return next;
    });
    setToast(`Unfollowed ${provider.name}.`);
  };

  useEffect(() => {
    const timers = followTimers.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  return { followStatus, toggleFollow };
}
