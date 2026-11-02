import { BadRequestException } from '@nestjs/common';

export type ListingSort =
  'newest' | 'price_asc' | 'price_desc' | 'ending_soon' | 'most_bids' | 'relevance';

export interface DecodedCursor {
  sortValue: string | number | null;
  id: string;
}

export const MAX_INT4 = 2147483647;

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})?$/;

export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!ISO_DATE_REGEX.test(value)) return false;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return false;
  const d = new Date(time);
  const year = d.getUTCFullYear();
  return year >= 1000 && year <= 9999;
}

export function encodeCursor(
  sort: ListingSort,
  sortValue: string | number | null,
  id: string,
): string {
  return Buffer.from(JSON.stringify({ s: sort, v: sortValue, id })).toString('base64url');
}

export function decodeCursor(cursor: string, expectedSort: ListingSort): DecodedCursor {
  if (!cursor || typeof cursor !== 'string') {
    throw new BadRequestException('Invalid pagination cursor');
  }

  let parsed: unknown;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestException('Invalid pagination cursor');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BadRequestException('Invalid pagination cursor');
  }

  const obj = parsed as Record<string, unknown>;
  const id = obj.id;
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new BadRequestException('Invalid pagination cursor');
  }

  const cursorSort = obj.s ?? obj.sort;
  if (cursorSort !== expectedSort) {
    throw new BadRequestException('Invalid pagination cursor');
  }

  const v = obj.v !== undefined ? obj.v : obj.sortValue;

  switch (expectedSort) {
    case 'newest': {
      if (!isValidIsoDate(v)) {
        throw new BadRequestException('Invalid pagination cursor');
      }
      return { sortValue: v, id };
    }
    case 'ending_soon': {
      if (v !== null && !isValidIsoDate(v)) {
        throw new BadRequestException('Invalid pagination cursor');
      }
      return { sortValue: v ?? null, id };
    }
    case 'price_asc':
    case 'price_desc': {
      if (
        v !== null &&
        (typeof v !== 'number' ||
          !Number.isInteger(v) ||
          !Number.isFinite(v) ||
          v < 0 ||
          v > MAX_INT4)
      ) {
        throw new BadRequestException('Invalid pagination cursor');
      }
      return { sortValue: v ?? null, id };
    }
    case 'most_bids': {
      if (
        typeof v !== 'number' ||
        !Number.isInteger(v) ||
        !Number.isFinite(v) ||
        v < 0 ||
        v > MAX_INT4
      ) {
        throw new BadRequestException('Invalid pagination cursor');
      }
      return { sortValue: v, id };
    }
    case 'relevance': {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
        throw new BadRequestException('Invalid pagination cursor');
      }
      return { sortValue: v, id };
    }
    default:
      throw new BadRequestException('Invalid pagination cursor');
  }
}
