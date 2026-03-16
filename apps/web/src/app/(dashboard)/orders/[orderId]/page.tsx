import { OrderDetailView } from "./order-detail-view";

interface OrderDetailPageProps {
  params: Promise<{ orderId: string }>;
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { orderId } = await params;
  return <OrderDetailView orderId={orderId} />;
}
