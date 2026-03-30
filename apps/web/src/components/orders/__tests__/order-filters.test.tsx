import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock nuqs before importing the component
const mockSetSearch = vi.fn();
const mockSetStatus = vi.fn();
const mockSetFinancial = vi.fn();

vi.mock("nuqs", () => ({
  useQueryState: vi.fn((key: string) => {
    switch (key) {
      case "q":
        return ["", mockSetSearch];
      case "status":
        return ["", mockSetStatus];
      case "financial":
        return ["", mockSetFinancial];
      default:
        return ["", vi.fn()];
    }
  }),
}));

import { OrderFilters } from "../order-filters";

describe("OrderFilters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the search input", () => {
    render(<OrderFilters />);
    expect(screen.getByPlaceholderText("Search orders...")).toBeInTheDocument();
  });

  it("renders fulfillment status filter with options", () => {
    render(<OrderFilters />);
    const selects = screen.getAllByRole("combobox");
    // There should be two select dropdowns (fulfillment and financial)
    expect(selects.length).toBe(2);
  });

  it("renders all fulfillment status options", () => {
    render(<OrderFilters />);
    expect(screen.getByText("All Statuses")).toBeInTheDocument();
    expect(screen.getByText("Unfulfilled")).toBeInTheDocument();
    expect(screen.getByText("Partially Fulfilled")).toBeInTheDocument();
    expect(screen.getByText("Fulfilled")).toBeInTheDocument();
    expect(screen.getByText("Restocked")).toBeInTheDocument();
  });

  it("renders all financial status options", () => {
    render(<OrderFilters />);
    expect(screen.getByText("All Financial")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Authorized")).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
    expect(screen.getByText("Partial Refund")).toBeInTheDocument();
    expect(screen.getByText("Refunded")).toBeInTheDocument();
  });

  it("calls setSearch when user types in the search input", async () => {
    const user = userEvent.setup();
    render(<OrderFilters />);
    const searchInput = screen.getByPlaceholderText("Search orders...");
    await user.type(searchInput, "a");
    expect(mockSetSearch).toHaveBeenCalled();
  });

  it("calls setStatus when fulfillment filter is changed", async () => {
    const user = userEvent.setup();
    render(<OrderFilters />);
    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "FULFILLED");
    expect(mockSetStatus).toHaveBeenCalled();
  });

  it("calls setFinancial when financial filter is changed", async () => {
    const user = userEvent.setup();
    render(<OrderFilters />);
    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[1], "PAID");
    expect(mockSetFinancial).toHaveBeenCalled();
  });
});
