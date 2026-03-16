import { PageHeader } from "@/components/layout/page-header";
import { ActivityFeedView } from "./activity-feed-view";

export default function ActivityPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity"
        description="Real-time feed of order syncs, shipment updates, and webhook events"
      />
      <ActivityFeedView />
    </div>
  );
}
