"use client";

import { useActivity } from "@/hooks/use-activity";
import { EventFeed } from "@/components/activity/event-feed";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";

export function ActivityFeedView() {
  const { data: events, isLoading, isFetching } = useActivity();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {isFetching && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Updating...
          </div>
        )}
        <Badge variant="info">{events?.length ?? 0} events</Badge>
      </div>
      <EventFeed events={events ?? []} />
    </div>
  );
}
