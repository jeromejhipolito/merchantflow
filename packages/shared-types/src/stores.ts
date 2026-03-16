export type StoreStatus = "ACTIVE" | "SUSPENDED" | "UNINSTALLED";

export interface Store {
  id: string;
  name: string;
  email: string;
  shopifyDomain: string;
  currency: string;
  timezone: string;
  status: StoreStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectStoreInput {
  shopifyDomain: string;
  accessToken: string;
  name: string;
  email: string;
}
