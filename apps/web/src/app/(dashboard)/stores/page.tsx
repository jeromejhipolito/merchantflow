import { PageHeader } from "@/components/layout/page-header";
import { StoresGrid } from "./stores-grid";

export default function StoresPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Connected Stores"
        description="Manage your Shopify store integrations"
      />
      <StoresGrid />
    </div>
  );
}
