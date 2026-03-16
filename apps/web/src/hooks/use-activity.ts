import { useQuery } from "@tanstack/react-query";
import type { ActivityEvent } from "@merchantflow/shared-types";
import { apiClient } from "@/lib/api-client";
import { mockActivityEvents } from "@/lib/mock-data";

export function useActivity() {
  return useQuery({
    queryKey: ["activity"],
    queryFn: async () => {
      try {
        return await apiClient<ActivityEvent[]>("/api/activity");
      } catch {
        return mockActivityEvents;
      }
    },
    refetchInterval: 5000,
  });
}
