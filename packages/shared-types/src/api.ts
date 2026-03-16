export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
  requestId: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    retryAfterSeconds?: number;
  };
  requestId: string;
}

export interface PaginationMeta {
  cursor: string | null;
  hasMore: boolean;
  total?: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: PaginationMeta;
}
