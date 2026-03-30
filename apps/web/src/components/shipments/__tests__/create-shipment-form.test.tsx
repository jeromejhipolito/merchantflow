import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { CreateShipmentForm } from "../create-shipment-form";

describe("CreateShipmentForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the form title", () => {
    render(<CreateShipmentForm orderId="order-123" />);
    expect(
      screen.getByRole("heading", { name: "Create Shipment" })
    ).toBeInTheDocument();
  });

  it("renders carrier select field", () => {
    render(<CreateShipmentForm orderId="order-123" />);
    expect(screen.getByText("Carrier")).toBeInTheDocument();
    expect(screen.getByText("USPS")).toBeInTheDocument();
    expect(screen.getByText("UPS")).toBeInTheDocument();
    expect(screen.getByText("FedEx")).toBeInTheDocument();
    expect(screen.getByText("DHL")).toBeInTheDocument();
  });

  it("renders service select field", () => {
    render(<CreateShipmentForm orderId="order-123" />);
    expect(screen.getByText("Service")).toBeInTheDocument();
    expect(screen.getByText("Ground")).toBeInTheDocument();
    expect(screen.getByText("Priority")).toBeInTheDocument();
    expect(screen.getByText("Express")).toBeInTheDocument();
    expect(screen.getByText("Overnight")).toBeInTheDocument();
  });

  it("renders weight input field", () => {
    render(<CreateShipmentForm orderId="order-123" />);
    expect(screen.getByLabelText("Weight (grams)")).toBeInTheDocument();
  });

  it("renders dimension input fields", () => {
    render(<CreateShipmentForm orderId="order-123" />);
    expect(screen.getByLabelText("Length (cm)")).toBeInTheDocument();
    expect(screen.getByLabelText("Width (cm)")).toBeInTheDocument();
    expect(screen.getByLabelText("Height (cm)")).toBeInTheDocument();
  });

  it("renders the submit button", () => {
    render(<CreateShipmentForm orderId="order-123" />);
    expect(
      screen.getByRole("button", { name: "Create Shipment" })
    ).toBeInTheDocument();
  });

  it("allows selecting a carrier", async () => {
    const user = userEvent.setup();
    render(<CreateShipmentForm orderId="order-123" />);
    const carrierSelect = screen.getByLabelText("Carrier");
    await user.selectOptions(carrierSelect, "UPS");
    expect(carrierSelect).toHaveValue("UPS");
  });

  it("allows entering weight", async () => {
    const user = userEvent.setup();
    render(<CreateShipmentForm orderId="order-123" />);
    const weightInput = screen.getByLabelText("Weight (grams)");
    await user.type(weightInput, "500");
    expect(weightInput).toHaveValue(500);
  });

  it("shows loading state during submission", async () => {
    render(<CreateShipmentForm orderId="order-123" />);
    const submitButton = screen.getByRole("button", {
      name: "Create Shipment",
    });

    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Creating..." })
      ).toBeInTheDocument();
    });

    // Wait for submission to finish
    await waitFor(
      () => {
        expect(
          screen.getByRole("button", { name: "Create Shipment" })
        ).toBeInTheDocument();
      },
      { timeout: 2000 }
    );
  });

  it("disables the submit button during submission", async () => {
    render(<CreateShipmentForm orderId="order-123" />);
    const submitButton = screen.getByRole("button", {
      name: "Create Shipment",
    });

    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Creating..." })).toBeDisabled();
    });
  });

  it("calls onSuccess callback after successful submission", async () => {
    const onSuccess = vi.fn();
    render(<CreateShipmentForm orderId="order-123" onSuccess={onSuccess} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Create Shipment" })
    );

    await waitFor(
      () => {
        expect(onSuccess).toHaveBeenCalledTimes(1);
      },
      { timeout: 2000 }
    );
  });
});
