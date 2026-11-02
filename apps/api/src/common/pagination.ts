export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
}

export function paginate<T extends { id: string }>(rows: T[], limit: number): PaginatedResult<T>;
export function paginate<T>(
  rows: T[],
  limit: number,
  getCursor: (item: T) => string,
): PaginatedResult<T>;
export function paginate<T>(
  rows: T[],
  limit: number,
  getCursor: (item: T) => string = (item) => (item as { id: string }).id,
): PaginatedResult<T> {
  const safeLimit = Math.max(1, limit);
  const hasMore = rows.length > safeLimit;
  const items = hasMore ? rows.slice(0, safeLimit) : rows;
  const lastItem = items.length > 0 ? items[items.length - 1] : undefined;
  const nextCursor = hasMore && lastItem ? getCursor(lastItem) : null;
  return { items, nextCursor };
}
