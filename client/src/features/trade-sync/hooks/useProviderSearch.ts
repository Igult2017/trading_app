import { useMemo, useState } from "react";
import { AVAILABLE_PROVIDERS } from "../data/accounts";

/** Free-text filter over the marketplace directory, matching name or handle. */
export function useProviderSearch() {
  const [providerQuery, setProviderQuery] = useState("");

  const filteredProviders = useMemo(() => {
    const q = providerQuery.trim().toLowerCase();
    if (!q) return AVAILABLE_PROVIDERS;
    return AVAILABLE_PROVIDERS.filter(
      (p) => p.name.toLowerCase().includes(q) || p.handle.toLowerCase().includes(q)
    );
  }, [providerQuery]);

  return { providerQuery, setProviderQuery, filteredProviders };
}
