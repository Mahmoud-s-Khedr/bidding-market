import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { decodeBidCursor, encodeBidCursor } from './bid.cursor.js';

describe('bid cursor', () => {
  it('encodes and decodes cursors with numeric sort value', () => {
    const encoded = encodeBidCursor(5000, 'bid123');
    expect(decodeBidCursor(encoded)).toEqual({ sortValue: 5000, id: 'bid123' });
  });

  it('encodes and decodes cursors with string/date sort value', () => {
    const now = new Date().toISOString();
    const encoded = encodeBidCursor(now, 'bid456');
    expect(decodeBidCursor(encoded)).toEqual({ sortValue: now, id: 'bid456' });
  });

  it('encodes and decodes cursors with null sort value', () => {
    const encoded = encodeBidCursor(null, 'bid789');
    expect(decodeBidCursor(encoded)).toEqual({ sortValue: null, id: 'bid789' });
  });

  it('supports raw id fallback cursor', () => {
    expect(decodeBidCursor('raw_bid_id-123')).toEqual({ sortValue: null, id: 'raw_bid_id-123' });
  });

  it('throws on empty or invalid cursor', () => {
    expect(() => decodeBidCursor('')).toThrow(BadRequestException);
    expect(() => decodeBidCursor('   ')).toThrow(BadRequestException);
    expect(() => decodeBidCursor('$$$not-valid$$$')).toThrow(BadRequestException);
    // Base64 of invalid json with missing id
    const invalidJson = Buffer.from(JSON.stringify({ v: 100 })).toString('base64url');
    expect(() => decodeBidCursor(invalidJson)).toThrow(BadRequestException);
  });
});
