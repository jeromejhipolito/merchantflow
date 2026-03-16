import { ShipmentDetailView } from "./shipment-detail-view";

interface ShipmentDetailPageProps {
  params: Promise<{ shipmentId: string }>;
}

export default async function ShipmentDetailPage({
  params,
}: ShipmentDetailPageProps) {
  const { shipmentId } = await params;
  return <ShipmentDetailView shipmentId={shipmentId} />;
}
