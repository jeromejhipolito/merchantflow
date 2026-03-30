import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "../card";

describe("Card", () => {
  it("renders children content", () => {
    render(<Card>Card body</Card>);
    expect(screen.getByText("Card body")).toBeInTheDocument();
  });

  it("accepts custom className", () => {
    render(<Card className="max-w-lg">Content</Card>);
    const card = screen.getByText("Content").closest("div");
    expect(card).toHaveClass("max-w-lg");
  });

  it("renders with border and shadow", () => {
    render(<Card>Styled</Card>);
    const card = screen.getByText("Styled").closest("div");
    expect(card).toHaveClass("rounded-lg", "border", "border-gray-200", "bg-white", "shadow-sm");
  });
});

describe("CardHeader", () => {
  it("renders children", () => {
    render(<CardHeader>Header</CardHeader>);
    expect(screen.getByText("Header")).toBeInTheDocument();
  });

  it("applies border-bottom styling", () => {
    render(<CardHeader>Header</CardHeader>);
    const header = screen.getByText("Header").closest("div");
    expect(header).toHaveClass("border-b", "border-gray-100");
  });

  it("accepts custom className", () => {
    render(<CardHeader className="p-8">Header</CardHeader>);
    const header = screen.getByText("Header").closest("div");
    expect(header).toHaveClass("p-8");
  });
});

describe("CardTitle", () => {
  it("renders as an h3 element", () => {
    render(<CardTitle>Order Details</CardTitle>);
    const title = screen.getByRole("heading", { level: 3 });
    expect(title).toHaveTextContent("Order Details");
  });

  it("accepts custom className", () => {
    render(<CardTitle className="text-lg">Title</CardTitle>);
    const title = screen.getByRole("heading");
    expect(title).toHaveClass("text-lg");
  });
});

describe("CardContent", () => {
  it("renders children", () => {
    render(<CardContent>Content area</CardContent>);
    expect(screen.getByText("Content area")).toBeInTheDocument();
  });

  it("applies padding classes", () => {
    render(<CardContent>Content</CardContent>);
    const content = screen.getByText("Content").closest("div");
    expect(content).toHaveClass("px-6", "py-4");
  });
});

describe("CardFooter", () => {
  it("renders children", () => {
    render(<CardFooter>Footer text</CardFooter>);
    expect(screen.getByText("Footer text")).toBeInTheDocument();
  });

  it("applies border-top styling", () => {
    render(<CardFooter>Footer</CardFooter>);
    const footer = screen.getByText("Footer").closest("div");
    expect(footer).toHaveClass("border-t", "border-gray-100");
  });

  it("accepts custom className", () => {
    render(<CardFooter className="justify-end">Footer</CardFooter>);
    const footer = screen.getByText("Footer").closest("div");
    expect(footer).toHaveClass("justify-end");
  });
});

describe("Card composition", () => {
  it("renders a full card with header, title, content, and footer", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Orders</CardTitle>
        </CardHeader>
        <CardContent>Table goes here</CardContent>
        <CardFooter>Pagination</CardFooter>
      </Card>
    );

    expect(screen.getByRole("heading", { name: "Orders" })).toBeInTheDocument();
    expect(screen.getByText("Table goes here")).toBeInTheDocument();
    expect(screen.getByText("Pagination")).toBeInTheDocument();
  });
});
