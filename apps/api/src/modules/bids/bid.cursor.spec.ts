import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { decodeBidCursor, encodeBidCursor } from './bid.cursor.js';

describe('bid cursor', () => {
  it('encodes and decodes cursors with numeric sort value for amount and delivery', () => {
    const encodedAmount = encodeBidCursor('amount_asc', 5000, 'bid123');
    expect(decodeBidCursor(encodedAmount, 'amount_asc')).toEqual({ sortValue: 5000, id: 'bid123' });

    const encodedDelivery = encodeBidCursor('delivery', 7, 'bid123');
    expect(decodeBidCursor(encodedDelivery, 'delivery')).toEqual({ sortValue: 7, id: 'bid123' });
  });

  it('encodes and decodes cursors with ISO date for newest', () => {
    const now = new Date().toISOString();
    const encoded = encodeBidCursor('newest', now, 'bid456');
    expect(decodeBidCursor(encoded, 'newest')).toEqual({ sortValue: now, id: 'bid456' });
  });

  it('encodes and decodes cursors with float for rating', () => {
    const encoded = encodeBidCursor('rating', 4.5, 'bid789');
    expect(decodeBidCursor(encoded, 'rating')).toEqual({ sortValue: 4.5, id: 'bid789' });
  });

  it('rejects forged or mismatched cursors per sort (reviewer finding 4)', () => {
    // {"v":"abc"} on amount_asc
    const strOnAmount = Buffer.from(JSON.stringify({ v: 'abc', id: 'bid1' })).toString('base64url');
    expect(() => decodeBidCursor(strOnAmount, 'amount_asc')).toThrow(BadRequestException);

    // ISO string on amount_desc
    const dateOnAmount = Buffer.from(
      JSON.stringify({ v: new Date().toISOString(), id: 'bid1' }),
    ).toString('base64url');
    expect(() => decodeBidCursor(dateOnAmount, 'amount_desc')).toThrow(BadRequestException);

    // 1.5 on delivery
    const floatOnDelivery = Buffer.from(JSON.stringify({ v: 1.5, id: 'bid1' })).toString(
      'base64url',
    );
    expect(() => decodeBidCursor(floatOnDelivery, 'delivery')).toThrow(BadRequestException);

    // 5 on newest
    const numOnNewest = Buffer.from(JSON.stringify({ v: 5, id: 'bid1' })).toString('base64url');
    expect(() => decodeBidCursor(numOnNewest, 'newest')).toThrow(BadRequestException);

    // "zz" on rating
    const strOnRating = Buffer.from(JSON.stringify({ v: 'zz', id: 'bid1' })).toString('base64url');
    expect(() => decodeBidCursor(strOnRating, 'rating')).toThrow(BadRequestException);

    // 99999999999 (int32 overflow) on amount_asc
    const overflowAmount = Buffer.from(JSON.stringify({ v: 99999999999, id: 'bid1' })).toString(
      'base64url',
    );
    expect(() => decodeBidCursor(overflowAmount, 'amount_asc')).toThrow(BadRequestException);

    // Cursor from one sort used on another sort
    const amountCursor = encodeBidCursor('amount_asc', 1000, 'bid1');
    expect(() => decodeBidCursor(amountCursor, 'rating')).toThrow(BadRequestException);
  });

  it('rejects bare id fallback string (no longer supported)', () => {
    expect(() => decodeBidCursor('raw_bid_id-123')).toThrow(BadRequestException);
  });

  it('rejects NUL-byte or malformed cursors', () => {
    expect(() => decodeBidCursor('\0')).toThrow(BadRequestException);
    expect(() => decodeBidCursor('abc\0def')).toThrow(BadRequestException);
    const nulJson = Buffer.from(JSON.stringify({ v: 100, id: 'bid\0' })).toString('base64url');
    expect(() => decodeBidCursor(nulJson, 'amount_asc')).toThrow(BadRequestException);
    expect(() => decodeBidCursor('')).toThrow(BadRequestException);
    expect(() => decodeBidCursor('   ')).toThrow(BadRequestException);
    expect(() => decodeBidCursor('$$$not-valid$$$')).toThrow(BadRequestException);
  });
});
