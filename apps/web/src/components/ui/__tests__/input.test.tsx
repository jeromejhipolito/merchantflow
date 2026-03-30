import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import { Input } from "../input";

describe("Input", () => {
  it("renders with a label", () => {
    render(<Input label="Email" />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("generates id from label text", () => {
    render(<Input label="First Name" />);
    const input = screen.getByLabelText("First Name");
    expect(input).toHaveAttribute("id", "first-name");
  });

  it("uses explicit id over generated one", () => {
    render(<Input label="Email" id="custom-email" />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("id", "custom-email");
  });

  it("renders without a label", () => {
    render(<Input placeholder="Type here" />);
    expect(screen.getByPlaceholderText("Type here")).toBeInTheDocument();
  });

  it("shows error message when error prop is set", () => {
    render(<Input label="Email" error="Email is required" />);
    expect(screen.getByText("Email is required")).toBeInTheDocument();
  });

  it("applies error styling to the input when error is present", () => {
    render(<Input label="Email" error="Invalid" />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveClass("border-red-500");
  });

  it("renders the error in a paragraph element", () => {
    render(<Input error="Required field" />);
    const errorEl = screen.getByText("Required field");
    expect(errorEl.tagName).toBe("P");
    expect(errorEl).toHaveClass("text-red-600");
  });

  it("shows helper text when no error is present", () => {
    render(<Input helperText="Enter your email address" />);
    expect(screen.getByText("Enter your email address")).toBeInTheDocument();
  });

  it("hides helper text when error is present", () => {
    render(<Input helperText="Helper" error="Error" />);
    expect(screen.queryByText("Helper")).not.toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("forwards ref correctly", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it("handles onChange events", () => {
    const handleChange = vi.fn();
    render(<Input label="Name" onChange={handleChange} />);
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Jerome" },
    });
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it("accepts custom className", () => {
    render(<Input className="w-1/2" placeholder="test" />);
    const input = screen.getByPlaceholderText("test");
    expect(input).toHaveClass("w-1/2");
  });
});
