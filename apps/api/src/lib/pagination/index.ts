// =============================================================================
// Cursor-Based Pagination
// =============================================================================
// We use cursor pagination (not offset) because:
// 1. Stable results when new records are inserted during paging
// 2. No OFFSET performance degradation on large tables
// 3. Mobile-friendly (no page count, just "load more")
//
// Cursor is the `id` (UUID) of the last item. Prisma's cursor API handles this.
//
// API contract:
//   Request:  ?cursor=<uuid>&limit=20
//   Response: { data: [...], pagination: { cursor, hasMore, total? } }

export interface PaginationParams {
  cursor?: string; // UUID of last item (exclusive — start after this)
  limit: number; // clamped to [1, 100], default 20
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    cursor: string | null; // null means no more pages
    hasMore: boolean;
    total?: number; // optional — expensive on large tables, only include when cheap
  };
}

/**
 * Parses and validates pagination query parameters.
 * Clamps limit to [1, 100] to prevent unbounded result sets.
 */
export function parsePaginationParams(query: {
  cursor?: string;
  limit?: string;
}): PaginationParams {
  const limit = Math.min(
    Math.max(parseInt(query.limit ?? "20", 10) || 20, 1),
    100
  );

  return {
    cursor: query.cursor || undefined,
    limit,
  };
}

/**
 * Builds the pagination response object.
 * We fetch limit + 1 items to determine hasMore without a COUNT query.
 */
export function buildPaginatedResponse<T extends { id: string }>(
  items: T[],
  limit: number,
  total?: number
): PaginatedResponse<T> {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const lastItem = data[data.length - 1];

  return {
    data,
    pagination: {
      cursor: lastItem?.id ?? null,
      hasMore,
      ...(total !== undefined && { total }),
    },
  };
}

/**
 * Builds Prisma cursor/take args from pagination params.
 * Fetches limit + 1 to detect hasMore.
 */
export function buildPrismaPaginationArgs(params: PaginationParams) {
  return {
    take: params.limit + 1, // +1 to detect hasMore
    ...(params.cursor && {
      cursor: { id: params.cursor },
      skip: 1, // skip the cursor record itself
    }),
    orderBy: { createdAt: "desc" as const },
  };
}
