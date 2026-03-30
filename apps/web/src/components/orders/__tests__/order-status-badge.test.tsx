import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { OrderStatusBadge } from "../order-status-badge";

describe("OrderStatusBadge", () => {
  it("renders 'Unfulfilled' with warning variant for UNFULFILLED", () => {
    render(<OrderStatusBadge status="UNFULFILLED" />);
    const badge = screen.getByText("Unfulfilled");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-amber-50", "text-amber-700");
  });

  it("renders 'Partial' with info variant for PARTIALLY_FULFILLED", () => {
    render(<OrderStatusBadge status="PARTIALLY_FULFILLED" />);
    const badge = screen.getByText("Partial");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-blue-50", "text-blue-700");
  });

  it("renders 'Fulfilled' with success variant for FULFILLED", () => {
    render(<OrderStatusBadge status="FULFILLED" />);
    const badge = screen.getByText("Fulfilled");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-emerald-50", "text-emerald-700");
  });

  it("renders 'Restocked' with purple variant for RESTOCKED", () => {
    render(<OrderStatusBadge status="RESTOCKED" />);
    const badge = screen.getByText("Restocked");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-purple-50", "text-purple-700");
  });
});
