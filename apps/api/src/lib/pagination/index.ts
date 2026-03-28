export interface PaginationParams {
  cursor?: string;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    cursor: string | null;
    hasMore: boolean;
    total?: number;
  };
}

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

export function buildPrismaPaginationArgs(params: PaginationParams) {
  return {
    take: params.limit + 1,
    ...(params.cursor && {
      cursor: { id: params.cursor },
      skip: 1,
    }),
    orderBy: { createdAt: "desc" as const },
  };
}
