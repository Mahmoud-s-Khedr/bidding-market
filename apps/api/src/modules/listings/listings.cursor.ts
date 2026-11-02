import { BadRequestException } from '@nestjs/common';

export type ListingSort =
  'newest' | 'price_asc' | 'price_desc' | 'ending_soon' | 'most_bids' | 'relevance';

export interface DecodedCursor {
  sortValue: string | number | null;
  id: string;
}

export function encodeCursor(sortValue: string | number | null, id: string): string {
  return Buffer.from(JSON.stringify({ v: sortValue, id })).toString('base64url');
}

export function decodeCursor(cursor: string): DecodedCursor {
  if (!cursor || typeof cursor !== 'string') {
    throw new BadRequestException('Invalid pagination cursor');
  }
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    if (raw.startsWith('{') && raw.endsWith('}')) {
      const parsed = JSON.parse(raw) as { v?: unknown; sortValue?: unknown; id?: unknown };
      const sortValue = (parsed.v !== undefined ? parsed.v : parsed.sortValue) ?? null;
      const id = typeof parsed.id === 'string' ? parsed.id : undefined;
      if (!id) {
        throw new BadRequestException('Invalid pagination cursor');
      }
      return {
        sortValue:
          typeof sortValue === 'string' || typeof sortValue === 'number' || sortValue === null
            ? sortValue
            : null,
        id,
      };
    }
  } catch (err) {
    if (err instanceof BadRequestException) throw err;
  }

  if (/^[a-zA-Z0-9_-]+$/.test(cursor)) {
    return { sortValue: null, id: cursor };
  }
  throw new BadRequestException('Invalid pagination cursor');
}
