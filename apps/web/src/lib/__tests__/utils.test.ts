import { describe, it, expect, vi, afterEach } from "vitest";
import { cn, formatCurrency, formatDate, formatRelativeTime, truncate } from "../utils";

describe("cn", () => {
  it("merges class names correctly", () => {
    const result = cn("px-4", "py-2");
    expect(result).toBe("px-4 py-2");
  });

  it("handles conditional classes", () => {
    const result = cn("base", false && "hidden", "visible");
    expect(result).toBe("base visible");
  });

  it("resolves tailwind conflicts with tw-merge", () => {
    // tw-merge should keep the last conflicting utility
    const result = cn("px-4", "px-8");
    expect(result).toBe("px-8");
  });

  it("resolves conflicting text color classes", () => {
    const result = cn("text-red-500", "text-blue-500");
    expect(result).toBe("text-blue-500");
  });

  it("handles undefined and null values", () => {
    const result = cn("base", undefined, null, "extra");
    expect(result).toBe("base extra");
  });

  it("handles empty string inputs", () => {
    const result = cn("base", "", "extra");
    expect(result).toBe("base extra");
  });
});

describe("formatCurrency", () => {
  it("formats USD correctly with a number", () => {
    const result = formatCurrency(99.99, "USD");
    expect(result).toBe("$99.99");
  });

  it("formats USD correctly with a string amount", () => {
    const result = formatCurrency("1250.50", "USD");
    expect(result).toBe("$1,250.50");
  });

  it("defaults to USD when no currency is specified", () => {
    const result = formatCurrency(42);
    expect(result).toBe("$42.00");
  });

  it("formats PHP correctly", () => {
    const result = formatCurrency(1500, "PHP");
    // PHP is formatted with the PHP symbol
    expect(result).toContain("1,500.00");
  });

  it("formats zero correctly", () => {
    const result = formatCurrency(0, "USD");
    expect(result).toBe("$0.00");
  });

  it("formats large numbers with comma separators", () => {
    const result = formatCurrency(1000000, "USD");
    expect(result).toBe("$1,000,000.00");
  });
});

describe("formatDate", () => {
  it("returns a readable date string from ISO string", () => {
    const result = formatDate("2026-03-28T14:22:00Z");
    // Should contain the date parts
    expect(result).toMatch(/Mar/);
    expect(result).toMatch(/28/);
    expect(result).toMatch(/2026/);
  });

  it("returns a readable date string from a Date object", () => {
    const result = formatDate(new Date("2025-12-25T10:00:00Z"));
    expect(result).toMatch(/Dec/);
    expect(result).toMatch(/25/);
    expect(result).toMatch(/2025/);
  });

  it("includes the time component", () => {
    const result = formatDate("2026-01-15T08:30:00Z");
    // timeStyle: "short" should include hours and minutes
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe("formatRelativeTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' for a date less than 1 minute ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T12:00:00Z"));
    const result = formatRelativeTime("2026-03-29T12:00:00Z");
    expect(result).toBe("just now");
  });

  it("returns 'just now' for a date 30 seconds ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T12:00:30Z"));
    const result = formatRelativeTime("2026-03-29T12:00:00Z");
    expect(result).toBe("just now");
  });

  it("returns '5m ago' for a date 5 minutes ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T12:05:00Z"));
    const result = formatRelativeTime("2026-03-29T12:00:00Z");
    expect(result).toBe("5m ago");
  });

  it("returns '59m ago' for a date 59 minutes ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T12:59:00Z"));
    const result = formatRelativeTime("2026-03-29T12:00:00Z");
    expect(result).toBe("59m ago");
  });

  it("returns '1h ago' for a date 60 minutes ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T13:00:00Z"));
    const result = formatRelativeTime("2026-03-29T12:00:00Z");
    expect(result).toBe("1h ago");
  });

  it("returns '2h ago' for a date 2 hours ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T14:00:00Z"));
    const result = formatRelativeTime("2026-03-29T12:00:00Z");
    expect(result).toBe("2h ago");
  });

  it("returns '23h ago' for a date 23 hours ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-30T11:00:00Z"));
    const result = formatRelativeTime("2026-03-29T12:00:00Z");
    expect(result).toBe("23h ago");
  });

  it("returns '1d ago' for a date 24 hours ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-30T12:00:00Z"));
    const result = formatRelativeTime("2026-03-29T12:00:00Z");
    expect(result).toBe("1d ago");
  });

  it("returns '3d ago' for a date 3 days ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T12:00:00Z"));
    const result = formatRelativeTime("2026-03-29T12:00:00Z");
    expect(result).toBe("3d ago");
  });

  it("accepts a Date object", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T12:10:00Z"));
    const result = formatRelativeTime(new Date("2026-03-29T12:00:00Z"));
    expect(result).toBe("10m ago");
  });
});

describe("truncate", () => {
  it("returns the string unchanged when shorter than limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("returns the string unchanged when equal to limit", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates and adds ellipsis when string exceeds limit", () => {
    expect(truncate("hello world", 5)).toBe("hello...");
  });
});
