"use client";

import type { ActivityEvent } from "@merchantflow/shared-types";
import { EventCard } from "./event-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Activity } from "lucide-react";

interface EventFeedProps {
  events: ActivityEvent[];
  maxItems?: number;
}

export function EventFeed({ events, maxItems }: EventFeedProps) {
  const displayed = maxItems ? events.slice(0, maxItems) : events;

  if (displayed.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No activity yet"
        description="Events will appear here as orders are processed and shipments are created."
      />
    );
  }

  return (
    <div className="space-y-2">
      {displayed.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
}
