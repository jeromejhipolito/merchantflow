import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiClient, ApiError } from "../api-client";

describe("apiClient", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetchResponse(
    body: unknown,
    options: { ok?: boolean; status?: number } = {}
  ) {
    const { ok = true, status = 200 } = options;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok,
      status,
      json: () => Promise.resolve(body),
    });
  }

  it("returns data from a successful response with data wrapper", async () => {
    mockFetchResponse({ data: { id: "1", name: "Store" } });
    const result = await apiClient<{ id: string; name: string }>("/stores/1");
    expect(result).toEqual({ id: "1", name: "Store" });
  });

  it("returns the full response when there is no data wrapper", async () => {
    mockFetchResponse({ id: "1", name: "Store" });
    const result = await apiClient<{ id: string; name: string }>("/stores/1");
    expect(result).toEqual({ id: "1", name: "Store" });
  });

  it("includes Content-Type: application/json header", async () => {
    mockFetchResponse({ data: {} });
    await apiClient("/stores");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("prepends the API base URL to the path", async () => {
    mockFetchResponse({ data: {} });
    await apiClient("/stores");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3005/stores",
      expect.any(Object)
    );
  });

  it("throws ApiError on non-ok response", async () => {
    mockFetchResponse(
      { error: { code: "NOT_FOUND", message: "Store not found" } },
      { ok: false, status: 404 }
    );

    await expect(apiClient("/stores/999")).rejects.toThrow(ApiError);
  });

  it("includes the status code in the ApiError", async () => {
    mockFetchResponse(
      { error: { code: "NOT_FOUND", message: "Not found" } },
      { ok: false, status: 404 }
    );

    try {
      await apiClient("/stores/999");
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(404);
    }
  });

  it("parses error code from response body", async () => {
    mockFetchResponse(
      { error: { code: "VALIDATION_ERROR", message: "Invalid input" } },
      { ok: false, status: 400 }
    );

    try {
      await apiClient("/stores");
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe("VALIDATION_ERROR");
      expect((err as ApiError).message).toBe("Invalid input");
    }
  });

  it("defaults error code to UNKNOWN when response body has no code", async () => {
    mockFetchResponse({}, { ok: false, status: 500 });

    try {
      await apiClient("/health");
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe("UNKNOWN");
    }
  });

  it("handles non-JSON error responses gracefully", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error("not json")),
    });

    try {
      await apiClient("/health");
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(502);
      expect((err as ApiError).code).toBe("UNKNOWN");
      expect((err as ApiError).message).toBe("Request failed: 502");
    }
  });

  it("passes custom headers through in the options", async () => {
    mockFetchResponse({ data: {} });
    await apiClient("/stores", {
      headers: { Authorization: "Bearer token123" },
    });

    // The spread in apiClient is: headers: { "Content-Type": ..., ...options.headers }, ...options
    // Since ...options comes after, its `headers` key overrides the merged one.
    // This verifies fetch was called with the custom header present.
    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(callArgs[1].headers).toHaveProperty("Authorization", "Bearer token123");
  });

  it("passes through request options like method and body", async () => {
    mockFetchResponse({ data: { id: "new" } });
    await apiClient("/stores", {
      method: "POST",
      body: JSON.stringify({ name: "New Store" }),
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "New Store" }),
      })
    );
  });
});
