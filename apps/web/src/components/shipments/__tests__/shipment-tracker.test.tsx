import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ShipmentTracker } from "../shipment-tracker";

describe("ShipmentTracker", () => {
  const stepLabels = ["Pending", "Label Ready", "Shipped", "In Transit", "Delivered"];

  it("renders all five tracking steps", () => {
    render(<ShipmentTracker status="PENDING" />);
    for (const label of stepLabels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("highlights only the first step as completed when status is PENDING", () => {
    render(<ShipmentTracker status="PENDING" />);
    // PENDING has statusOrder index 0, so step at index 0 is completed
    const pendingText = screen.getByText("Pending");
    expect(pendingText).toHaveClass("text-gray-900");

    // Steps after PENDING should be inactive
    const deliveredText = screen.getByText("Delivered");
    expect(deliveredText).toHaveClass("text-gray-400");
  });

  it("highlights steps up to LABEL_READY as completed", () => {
    render(<ShipmentTracker status="LABEL_READY" />);
    // LABEL_READY has statusOrder index 1
    expect(screen.getByText("Pending")).toHaveClass("text-gray-900");
    expect(screen.getByText("Label Ready")).toHaveClass("text-gray-900");

    // Future steps should be inactive
    expect(screen.getByText("Shipped")).toHaveClass("text-gray-400");
    expect(screen.getByText("Delivered")).toHaveClass("text-gray-400");
  });

  it("highlights steps up to SHIPPED as completed", () => {
    render(<ShipmentTracker status="SHIPPED" />);
    expect(screen.getByText("Pending")).toHaveClass("text-gray-900");
    expect(screen.getByText("Label Ready")).toHaveClass("text-gray-900");
    expect(screen.getByText("Shipped")).toHaveClass("text-gray-900");

    expect(screen.getByText("In Transit")).toHaveClass("text-gray-400");
    expect(screen.getByText("Delivered")).toHaveClass("text-gray-400");
  });

  it("highlights steps up to IN_TRANSIT as completed", () => {
    render(<ShipmentTracker status="IN_TRANSIT" />);
    expect(screen.getByText("Pending")).toHaveClass("text-gray-900");
    expect(screen.getByText("Label Ready")).toHaveClass("text-gray-900");
    expect(screen.getByText("Shipped")).toHaveClass("text-gray-900");
    expect(screen.getByText("In Transit")).toHaveClass("text-gray-900");

    expect(screen.getByText("Delivered")).toHaveClass("text-gray-400");
  });

  it("highlights all steps as completed when status is DELIVERED", () => {
    render(<ShipmentTracker status="DELIVERED" />);
    for (const label of stepLabels) {
      expect(screen.getByText(label)).toHaveClass("text-gray-900");
    }
  });

  it("shows all steps as inactive for FAILED status (statusOrder -1)", () => {
    render(<ShipmentTracker status="FAILED" />);
    for (const label of stepLabels) {
      expect(screen.getByText(label)).toHaveClass("text-gray-400");
    }
  });

  it("shows all steps as inactive for RETURNED status", () => {
    render(<ShipmentTracker status="RETURNED" />);
    for (const label of stepLabels) {
      expect(screen.getByText(label)).toHaveClass("text-gray-400");
    }
  });

  it("applies active ring styling to the current step", () => {
    const { container } = render(<ShipmentTracker status="SHIPPED" />);
    // SHIPPED is statusOrder index 2, which is step index 2 ("Shipped")
    // The active step should have ring-4 class on its circle
    const circles = container.querySelectorAll(".rounded-full.border-2");
    // Step 0, 1 are completed but not active. Step 2 is active.
    expect(circles[2]).toHaveClass("ring-4");
    // Other completed steps should not have ring
    expect(circles[0]).not.toHaveClass("ring-4");
    expect(circles[1]).not.toHaveClass("ring-4");
  });

  it("renders connector lines between steps", () => {
    const { container } = render(<ShipmentTracker status="PENDING" />);
    // There should be 4 connector lines (between 5 steps)
    const connectors = container.querySelectorAll(".h-0\\.5");
    expect(connectors.length).toBe(4);
  });
});
