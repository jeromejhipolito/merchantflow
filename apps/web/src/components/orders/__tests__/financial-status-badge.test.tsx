import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FinancialStatusBadge } from "../financial-status-badge";

describe("FinancialStatusBadge", () => {
  it("renders 'Paid' with success variant for PAID", () => {
    render(<FinancialStatusBadge status="PAID" />);
    const badge = screen.getByText("Paid");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-emerald-50", "text-emerald-700");
  });

  it("renders 'Pending' with warning variant for PENDING", () => {
    render(<FinancialStatusBadge status="PENDING" />);
    const badge = screen.getByText("Pending");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-amber-50", "text-amber-700");
  });

  it("renders 'Refunded' with danger variant for REFUNDED", () => {
    render(<FinancialStatusBadge status="REFUNDED" />);
    const badge = screen.getByText("Refunded");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-red-50", "text-red-700");
  });

  it("renders 'Authorized' with info variant for AUTHORIZED", () => {
    render(<FinancialStatusBadge status="AUTHORIZED" />);
    const badge = screen.getByText("Authorized");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-blue-50", "text-blue-700");
  });

  it("renders 'Partially Paid' with info variant for PARTIALLY_PAID", () => {
    render(<FinancialStatusBadge status="PARTIALLY_PAID" />);
    const badge = screen.getByText("Partially Paid");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-blue-50", "text-blue-700");
  });

  it("renders 'Partial Refund' with purple variant for PARTIALLY_REFUNDED", () => {
    render(<FinancialStatusBadge status="PARTIALLY_REFUNDED" />);
    const badge = screen.getByText("Partial Refund");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-purple-50", "text-purple-700");
  });

  it("renders 'Voided' with default variant for VOIDED", () => {
    render(<FinancialStatusBadge status="VOIDED" />);
    const badge = screen.getByText("Voided");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-gray-100", "text-gray-700");
  });
});
