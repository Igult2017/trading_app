import type { QueryClient } from "@tanstack/react-query";
import { authFetch } from "./queryClient";

export function prefetchAdminData(queryClient: QueryClient): void {
  const endpoints: { queryKey: string[]; url: string }[] = [
    { queryKey: ['/api/admin/users'], url: '/api/admin/users' },
    { queryKey: ['/api/admin/stats'], url: '/api/admin/stats' },
  ];

  for (const { queryKey, url } of endpoints) {
    queryClient.prefetchQuery({
      queryKey,
      queryFn: () => authFetch(url).then(r => r.ok ? r.json() : null).catch(() => null),
      staleTime: Infinity,
    });
  }
}
