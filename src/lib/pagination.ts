/**
 * Pagination utilities
 * Supports both cursor-based (better performance) and offset-based pagination
 */

// Offset-based pagination constants
export const PaginationLimits = {
  SMALL: 10,
  MEDIUM: 50,
  LARGE: 100,
  MAX: 1000
};

export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginationResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * Parse offset-based pagination parameters
 */
export function parsePaginationParams(
  request: Request,
  defaultLimit: number = PaginationLimits.MEDIUM,
  maxLimit: number = PaginationLimits.MAX
): PaginationParams {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    Math.max(parseInt(searchParams.get('limit') || String(defaultLimit), 10), 1),
    maxLimit
  );
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

  return { limit, offset };
}

/**
 * Create offset-based pagination response
 */
export function createPaginationResponse<T>(
  data: T[],
  total: number,
  pagination: PaginationParams
): PaginationResponse<T> {
  return {
    data,
    pagination: {
      total,
      limit: pagination.limit,
      offset: pagination.offset,
      hasMore: pagination.offset + pagination.limit < total
    }
  };
}

/**
 * Cursor-based pagination utilities
 * Provides better performance than offset-based pagination for large datasets
 */

export interface CursorPaginationParams {
  cursor?: string; // ISO timestamp or ID
  limit?: number;
  direction?: 'next' | 'prev';
}

export interface CursorPaginationResult<T> {
  data: T[];
  nextCursor?: string;
  prevCursor?: string;
  hasMore: boolean;
}

/**
 * Parse cursor from query parameters
 */
export function parseCursorParams(request: Request): CursorPaginationParams {
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get('cursor') || undefined;
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const direction = (searchParams.get('direction') || 'next') as 'next' | 'prev';

  return {
    cursor,
    limit: Math.min(Math.max(limit, 1), 100), // Clamp between 1 and 100
    direction
  };
}

/**
 * Create cursor from timestamp and ID
 */
export function createCursor(timestamp: string | Date, id: string): string {
  const ts = typeof timestamp === 'string' ? timestamp : timestamp.toISOString();
  return Buffer.from(`${ts}:${id}`).toString('base64url');
}

/**
 * Parse cursor to get timestamp and ID
 */
export function parseCursor(cursor: string): { timestamp: string; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf-8');
    const [timestamp, id] = decoded.split(':');
    if (!timestamp || !id) return null;
    return { timestamp, id };
  } catch {
    return null;
  }
}

/**
 * Create pagination response with cursor
 * @param data - Array of items with created_at and id fields
 * @param limit - Limit used for pagination
 * @param timestampField - Field name for timestamp (default: 'created_at')
 */
export function createCursorResponse<T extends { [key: string]: any; id: string }>(
  data: T[],
  limit: number,
  timestampField: string = 'created_at'
): CursorPaginationResult<T> {
  if (data.length === 0) {
    return {
      data: [],
      hasMore: false
    };
  }

  const firstItem = data[0];
  const lastItem = data[data.length - 1];
  const hasMore = data.length === limit + 1; // We fetch one extra to check if there's more

  // Remove the extra item if we fetched it
  const actualData = hasMore ? data.slice(0, -1) : data;

  const firstTimestamp = firstItem[timestampField] || firstItem.created_at;
  const lastTimestamp = lastItem[timestampField] || lastItem.created_at;

  return {
    data: actualData,
    nextCursor: hasMore ? createCursor(lastTimestamp, lastItem.id) : undefined,
    prevCursor: actualData.length > 0 ? createCursor(firstTimestamp, firstItem.id) : undefined,
    hasMore
  };
}

/**
 * Build Supabase query with cursor pagination
 * @param query - Supabase query builder
 * @param cursor - Cursor string (base64 encoded timestamp:id)
 * @param direction - 'next' or 'prev'
 * @param timestampField - Field name for timestamp (default: 'created_at')
 */
export function applyCursorPagination<T>(
  query: any,
  cursor?: string,
  direction: 'next' | 'prev' = 'next',
  timestampField: string = 'created_at'
): any {
  if (!cursor) {
    return query.order(timestampField, { ascending: false });
  }

  const parsed = parseCursor(cursor);
  if (!parsed) {
    return query.order(timestampField, { ascending: false });
  }

  if (direction === 'next') {
    // For next page, get items before the cursor
    return query
      .lt(timestampField, parsed.timestamp)
      .order(timestampField, { ascending: false });
  } else {
    // For previous page, get items after the cursor
    return query
      .gt(timestampField, parsed.timestamp)
      .order(timestampField, { ascending: true });
  }
}
