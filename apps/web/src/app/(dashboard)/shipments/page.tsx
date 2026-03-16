import { PageHeader } from "@/components/layout/page-header";
import { ShipmentTable } from "@/components/shipments/shipment-table";

export default function ShipmentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Shipments"
        description="Track and manage all shipments across your stores"
      />
      <ShipmentTable />
    </div>
  );
}
