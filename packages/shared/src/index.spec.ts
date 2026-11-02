import { describe, expect, it } from 'vitest';
import {
  listingCreateSchema,
  listingQuerySchema,
  loginSchema,
  messageCreateSchema,
  passwordSchema,
  presignUploadSchema,
  registerSchema,
} from './index.js';
describe('shared schemas', () => {
  it('enforces password strength', () => {
    expect(passwordSchema.safeParse('alllowercase1').success).toBe(false);
    expect(passwordSchema.safeParse('GoodPassword1').success).toBe(true);
  });
  it('rejects inverted price ranges', () => {
    expect(
      listingCreateSchema.safeParse({
        kind: 'REQUEST',
        title: 'A valid title',
        description: 'A sufficiently detailed listing description',
        categoryId: 'c',
        priceType: 'RANGE',
        priceMinCents: 20,
        priceMaxCents: 10,
      }).success,
    ).toBe(false);
  });
});
describe('schema refinements', () => {
  it('normalizes email and validates business name', () => {
    expect(
      registerSchema.parse({
        email: 'A@EXAMPLE.COM',
        password: 'Password1',
        displayName: 'AB',
        isBusiness: false,
      }).email,
    ).toBe('a@example.com');
    expect(
      registerSchema.safeParse({
        email: 'a@b.com',
        password: 'Password1',
        displayName: 'AB',
        isBusiness: true,
      }).success,
    ).toBe(false);
    expect(loginSchema.parse({ email: 'A@B.COM', password: 'x' }).email).toBe('a@b.com');
  });
  it('covers range, query and message refinements', () => {
    const base = {
      kind: 'REQUEST',
      title: 'Valid title',
      description: 'valid description that is long enough',
      categoryId: 'c',
      priceType: 'RANGE',
      priceMinCents: 1,
      priceMaxCents: 2,
    };
    expect(listingCreateSchema.safeParse({ ...base, priceMaxCents: 0 }).success).toBe(false);
    expect(listingCreateSchema.safeParse({ ...base, priceMinCents: undefined }).success).toBe(
      false,
    );
    expect(listingQuerySchema.safeParse({ minPrice: 2, maxPrice: 1 }).success).toBe(false);
    expect(messageCreateSchema.safeParse({ type: 'TEXT' }).success).toBe(false);
    expect(messageCreateSchema.safeParse({ type: 'TEXT', body: 'yes' }).success).toBe(true);
  });
});
it('enforces upload purpose limits', () => {
  expect(
    presignUploadSchema.safeParse({
      purpose: 'AVATAR',
      fileName: 'a',
      mimeType: 'application/pdf',
      sizeBytes: 1,
    }).success,
  ).toBe(false);
  expect(
    presignUploadSchema.safeParse({
      purpose: 'AVATAR',
      fileName: 'a',
      mimeType: 'image/png',
      sizeBytes: 10_000_001,
    }).success,
  ).toBe(false);
  expect(
    presignUploadSchema.safeParse({
      purpose: 'AVATAR',
      fileName: 'a',
      mimeType: 'image/png',
      sizeBytes: 1,
    }).success,
  ).toBe(true);
});
