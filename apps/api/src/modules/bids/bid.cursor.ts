import { BadRequestException } from '@nestjs/common';
import type { BidSort } from '@market/shared';

export interface DecodedBidCursor {
  sortValue: string | number | null;
  id: string;
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})?$/;
const MAX_INT32 = 2147483647;

export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!ISO_DATE_REGEX.test(value)) return false;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return false;
  const d = new Date(time);
  const year = d.getUTCFullYear();
  return year >= 1000 && year <= 9999;
}

export function encodeBidCursor(
  sort: BidSort,
  sortValue: string | number | null,
  id: string,
): string {
  return Buffer.from(JSON.stringify({ s: sort, v: sortValue, id })).toString('base64url');
}

export function decodeBidCursor(cursor: string, expectedSort?: BidSort): DecodedBidCursor {
  if (!cursor || typeof cursor !== 'string') {
    throw new BadRequestException('Invalid pagination cursor');
  }

  if (cursor.includes('\0')) {
    throw new BadRequestException('Invalid pagination cursor');
  }

  let parsed: unknown;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    if (raw.includes('\0') || !raw.trim().startsWith('{') || !raw.trim().endsWith('}')) {
      throw new BadRequestException('Invalid pagination cursor');
    }
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestException('Invalid pagination cursor');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BadRequestException('Invalid pagination cursor');
  }

  const obj = parsed as Record<string, unknown>;
  const id = obj.id;
  if (typeof id !== 'string' || id.trim().length === 0 || id.includes('\0')) {
    throw new BadRequestException('Invalid pagination cursor');
  }

  const cursorSort = obj.s ?? obj.sort;
  if (expectedSort && cursorSort !== undefined && cursorSort !== expectedSort) {
    throw new BadRequestException('Invalid pagination cursor');
  }

  const v = obj.v !== undefined ? obj.v : obj.sortValue;

  if (expectedSort) {
    switch (expectedSort) {
      case 'newest': {
        if (!isValidIsoDate(v)) {
          throw new BadRequestException('Invalid pagination cursor');
        }
        return { sortValue: v, id };
      }
      case 'amount_asc':
      case 'amount_desc': {
        if (
          typeof v !== 'number' ||
          !Number.isInteger(v) ||
          !Number.isFinite(v) ||
          v < 0 ||
          v > MAX_INT32
        ) {
          throw new BadRequestException('Invalid pagination cursor');
        }
        return { sortValue: v, id };
      }
      case 'delivery': {
        if (
          typeof v !== 'number' ||
          !Number.isInteger(v) ||
          !Number.isFinite(v) ||
          v < 0 ||
          v > MAX_INT32
        ) {
          throw new BadRequestException('Invalid pagination cursor');
        }
        return { sortValue: v, id };
      }
      case 'rating': {
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 5) {
          throw new BadRequestException('Invalid pagination cursor');
        }
        return { sortValue: v, id };
      }
      default:
        throw new BadRequestException('Invalid pagination cursor');
    }
  }

  if (typeof v === 'string' || typeof v === 'number' || v === null) {
    return { sortValue: v, id };
  }

  throw new BadRequestException('Invalid pagination cursor');
}
