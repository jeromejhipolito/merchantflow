import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Badge } from "../badge";

describe("Badge", () => {
  it("renders children text", () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("applies default variant classes when no variant is specified", () => {
    render(<Badge>Default</Badge>);
    const badge = screen.getByText("Default");
    expect(badge).toHaveClass("bg-gray-100", "text-gray-700");
  });

  it("applies success variant classes", () => {
    render(<Badge variant="success">Success</Badge>);
    const badge = screen.getByText("Success");
    expect(badge).toHaveClass("bg-emerald-50", "text-emerald-700");
  });

  it("applies warning variant classes", () => {
    render(<Badge variant="warning">Warning</Badge>);
    const badge = screen.getByText("Warning");
    expect(badge).toHaveClass("bg-amber-50", "text-amber-700");
  });

  it("applies danger variant classes", () => {
    render(<Badge variant="danger">Danger</Badge>);
    const badge = screen.getByText("Danger");
    expect(badge).toHaveClass("bg-red-50", "text-red-700");
  });

  it("applies info variant classes", () => {
    render(<Badge variant="info">Info</Badge>);
    const badge = screen.getByText("Info");
    expect(badge).toHaveClass("bg-blue-50", "text-blue-700");
  });

  it("applies purple variant classes", () => {
    render(<Badge variant="purple">Purple</Badge>);
    const badge = screen.getByText("Purple");
    expect(badge).toHaveClass("bg-purple-50", "text-purple-700");
  });

  it("accepts a custom className", () => {
    render(<Badge className="mt-4">Custom</Badge>);
    const badge = screen.getByText("Custom");
    expect(badge).toHaveClass("mt-4");
  });

  it("renders as a span element", () => {
    render(<Badge>Span</Badge>);
    const badge = screen.getByText("Span");
    expect(badge.tagName).toBe("SPAN");
  });
});
