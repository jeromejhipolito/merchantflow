export type OrderFinancialStatus =
  | "PENDING"
  | "AUTHORIZED"
  | "PARTIALLY_PAID"
  | "PAID"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "VOIDED";

export type OrderFulfillmentStatus =
  | "UNFULFILLED"
  | "PARTIALLY_FULFILLED"
  | "FULFILLED"
  | "RESTOCKED";

export interface Order {
  id: string;
  storeId: string;
  shopifyOrderId: string;
  orderNumber: string;
  subtotalPrice: string;
  totalTax: string;
  totalShipping: string;
  totalDiscount: string;
  totalPrice: string;
  currencyCode: string;
  financialStatus: OrderFinancialStatus;
  fulfillmentStatus: OrderFulfillmentStatus;
  customerEmail: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerPhone: string | null;
  shippingAddress: ShippingAddress | null;
  lineItems: LineItem[];
  shipments: ShipmentSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface ShippingAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  countryCode: string | null;
  phone: string | null;
}

export interface LineItem {
  id: string;
  shopifyLineItemId: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  fulfilledQuantity: number;
}

export interface ShipmentSummary {
  id: string;
  status: string;
  carrier: string | null;
  trackingNumber: string | null;
}

export interface OrderListFilters {
  status?: OrderFulfillmentStatus;
  financialStatus?: OrderFinancialStatus;
  search?: string;
  cursor?: string;
  limit?: number;
}
