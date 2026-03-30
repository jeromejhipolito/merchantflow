import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Store } from "@merchantflow/shared-types";

// Mock the mock-data module so we don't pull in the full mock dependency chain
vi.mock("@/lib/mock-data", () => ({
  mockOrders: [],
}));

// Mock formatRelativeTime to return a stable value
vi.mock("@/lib/utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils");
  return {
    ...actual,
    formatRelativeTime: vi.fn(() => "2h ago"),
  };
});

import { StoreCard } from "../store-card";

const activeStore: Store = {
  id: "store_01",
  name: "Kultura Filipino",
  email: "hello@kulturafilipino.ph",
  shopifyDomain: "kultura-filipino.myshopify.com",
  currency: "PHP",
  timezone: "Asia/Manila",
  status: "ACTIVE",
  createdAt: "2025-11-15T08:30:00Z",
  updatedAt: "2026-03-28T14:22:00Z",
};

const suspendedStore: Store = {
  ...activeStore,
  id: "store_02",
  name: "Isla Handicrafts",
  shopifyDomain: "isla-handicrafts.myshopify.com",
  status: "SUSPENDED",
};

describe("StoreCard", () => {
  it("renders the store name", () => {
    render(<StoreCard store={activeStore} />);
    expect(screen.getByText("Kultura Filipino")).toBeInTheDocument();
  });

  it("renders the store domain", () => {
    render(<StoreCard store={activeStore} />);
    expect(
      screen.getByText("kultura-filipino.myshopify.com")
    ).toBeInTheDocument();
  });

  it("displays the currency", () => {
    render(<StoreCard store={activeStore} />);
    expect(screen.getByText("PHP")).toBeInTheDocument();
  });

  it("shows ACTIVE badge with success variant for active stores", () => {
    render(<StoreCard store={activeStore} />);
    const badge = screen.getByText("ACTIVE");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-emerald-50", "text-emerald-700");
  });

  it("shows SUSPENDED badge with warning variant for suspended stores", () => {
    render(<StoreCard store={suspendedStore} />);
    const badge = screen.getByText("SUSPENDED");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-amber-50", "text-amber-700");
  });

  it("displays the order count", () => {
    render(<StoreCard store={activeStore} />);
    expect(screen.getByText("Orders")).toBeInTheDocument();
  });

  it("displays the last sync time", () => {
    render(<StoreCard store={activeStore} />);
    expect(screen.getByText("2h ago")).toBeInTheDocument();
    expect(screen.getByText("Last Sync")).toBeInTheDocument();
  });
});
