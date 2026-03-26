const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3005";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiClient<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      error.error?.code ?? "UNKNOWN",
      error.error?.message ?? `Request failed: ${res.status}`
    );
  }

  const json = await res.json();
  return json.data ?? json;
}
