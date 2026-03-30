import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ShipmentStatusBadge } from "../shipment-status-badge";
import type { ShipmentStatus } from "@merchantflow/shared-types";

const statusTestCases: Array<{
  status: ShipmentStatus;
  label: string;
  variantClasses: string[];
}> = [
  {
    status: "PENDING",
    label: "Pending",
    variantClasses: ["bg-amber-50", "text-amber-700"],
  },
  {
    status: "LABEL_GENERATING",
    label: "Generating Label",
    variantClasses: ["bg-blue-50", "text-blue-700"],
  },
  {
    status: "LABEL_READY",
    label: "Label Ready",
    variantClasses: ["bg-blue-50", "text-blue-700"],
  },
  {
    status: "LABEL_FAILED",
    label: "Label Failed",
    variantClasses: ["bg-red-50", "text-red-700"],
  },
  {
    status: "SHIPPED",
    label: "Shipped",
    variantClasses: ["bg-purple-50", "text-purple-700"],
  },
  {
    status: "IN_TRANSIT",
    label: "In Transit",
    variantClasses: ["bg-blue-50", "text-blue-700"],
  },
  {
    status: "DELIVERED",
    label: "Delivered",
    variantClasses: ["bg-emerald-50", "text-emerald-700"],
  },
  {
    status: "FAILED",
    label: "Failed",
    variantClasses: ["bg-red-50", "text-red-700"],
  },
  {
    status: "RETURNED",
    label: "Returned",
    variantClasses: ["bg-gray-100", "text-gray-700"],
  },
];

describe("ShipmentStatusBadge", () => {
  it.each(statusTestCases)(
    "renders '$label' with correct variant classes for $status",
    ({ status, label, variantClasses }) => {
      render(<ShipmentStatusBadge status={status} />);
      const badge = screen.getByText(label);
      expect(badge).toBeInTheDocument();
      for (const cls of variantClasses) {
        expect(badge).toHaveClass(cls);
      }
    }
  );
});
