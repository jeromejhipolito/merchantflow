import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EmptyState } from "../empty-state";
import { Package } from "lucide-react";

describe("EmptyState", () => {
  it("renders the title", () => {
    render(
      <EmptyState
        icon={Package}
        title="No orders yet"
        description="Orders will appear here once synced."
      />
    );
    expect(screen.getByText("No orders yet")).toBeInTheDocument();
  });

  it("renders the description", () => {
    render(
      <EmptyState
        icon={Package}
        title="No orders"
        description="Connect a store to start syncing."
      />
    );
    expect(screen.getByText("Connect a store to start syncing.")).toBeInTheDocument();
  });

  it("renders the action button when actionLabel and onAction are provided", () => {
    const handleAction = vi.fn();
    render(
      <EmptyState
        icon={Package}
        title="No shipments"
        description="Create your first shipment."
        actionLabel="Create Shipment"
        onAction={handleAction}
      />
    );
    const button = screen.getByRole("button", { name: "Create Shipment" });
    expect(button).toBeInTheDocument();
  });

  it("calls onAction when the action button is clicked", () => {
    const handleAction = vi.fn();
    render(
      <EmptyState
        icon={Package}
        title="No shipments"
        description="Create your first shipment."
        actionLabel="Create Shipment"
        onAction={handleAction}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Create Shipment" }));
    expect(handleAction).toHaveBeenCalledTimes(1);
  });

  it("does not render the action button when actionLabel is absent", () => {
    render(
      <EmptyState
        icon={Package}
        title="No data"
        description="Nothing to show."
      />
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("does not render the action button when onAction is absent", () => {
    render(
      <EmptyState
        icon={Package}
        title="No data"
        description="Nothing to show."
        actionLabel="Add"
      />
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("accepts custom className", () => {
    const { container } = render(
      <EmptyState
        icon={Package}
        title="Empty"
        description="Desc"
        className="my-8"
      />
    );
    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveClass("my-8");
  });
});
