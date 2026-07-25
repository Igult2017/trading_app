import { useMemo, useState } from "react";
import type { Overview } from "./useOverview";

/** Free-text filter over the REAL marketplace directory (public masters from the overview). */
export function useProviderSearch(overview: Overview | undefined) {
  const [providerQuery, setProviderQuery] = useState("");

  const filteredProviders = useMemo(() => {
    const all = overview?.providers ?? [];
    const q = providerQuery.trim().toLowerCase();
    if (!q) return all;
    return all.filter((p) => p.name.toLowerCase().includes(q) || p.handle.toLowerCase().includes(q));
  }, [overview?.providers, providerQuery]);

  return { providerQuery, setProviderQuery, filteredProviders };
}
