import { PageHeader } from "@/components/layout/page-header";
import { SettingsView } from "./settings-view";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Configure webhook endpoints and notification preferences"
      />
      <SettingsView />
    </div>
  );
}
