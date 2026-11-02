import { describe, it, expect } from 'vitest';
import { formValuesToApiPayload, listingFormSchema } from './listing';

describe('Listing Validation Schemas', () => {
  const validBase = {
    kind: 'REQUEST' as const,
    title: 'Senior Next.js Engineer Needed',
    description:
      'We are seeking an engineer to build production grade applications with high accessibility.',
    categoryId: 'c-web',
    currency: 'USD',
  };

  it('validates FIXED price type correctly', () => {
    // Valid FIXED
    const valid = listingFormSchema.safeParse({
      ...validBase,
      priceType: 'FIXED',
      priceMin: 120.5,
    });
    expect(valid.success).toBe(true);

    // Missing FIXED price
    const missing = listingFormSchema.safeParse({
      ...validBase,
      priceType: 'FIXED',
    });
    expect(missing.success).toBe(false);

    // Negative FIXED price
    const negative = listingFormSchema.safeParse({
      ...validBase,
      priceType: 'FIXED',
      priceMin: -10,
    });
    expect(negative.success).toBe(false);
  });

  it('validates RANGE price type correctly', () => {
    // Valid RANGE
    const valid = listingFormSchema.safeParse({
      ...validBase,
      priceType: 'RANGE',
      priceMin: 100,
      priceMax: 300,
    });
    expect(valid.success).toBe(true);

    // Missing min
    const missingMin = listingFormSchema.safeParse({
      ...validBase,
      priceType: 'RANGE',
      priceMax: 300,
    });
    expect(missingMin.success).toBe(false);

    // Missing max
    const missingMax = listingFormSchema.safeParse({
      ...validBase,
      priceType: 'RANGE',
      priceMin: 100,
    });
    expect(missingMax.success).toBe(false);

    // Max < Min
    const invalidRange = listingFormSchema.safeParse({
      ...validBase,
      priceType: 'RANGE',
      priceMin: 500,
      priceMax: 100,
    });
    expect(invalidRange.success).toBe(false);
  });

  it('validates NEGOTIABLE price type without requiring prices', () => {
    const valid = listingFormSchema.safeParse({
      ...validBase,
      priceType: 'NEGOTIABLE',
    });
    expect(valid.success).toBe(true);
  });

  it('validates delivery days as positive integer', () => {
    const valid = listingFormSchema.safeParse({
      ...validBase,
      priceType: 'NEGOTIABLE',
      deliveryDays: 10,
    });
    expect(valid.success).toBe(true);

    const nonInteger = listingFormSchema.safeParse({
      ...validBase,
      priceType: 'NEGOTIABLE',
      deliveryDays: 5.5,
    });
    expect(nonInteger.success).toBe(false);

    const negative = listingFormSchema.safeParse({
      ...validBase,
      priceType: 'NEGOTIABLE',
      deliveryDays: -1,
    });
    expect(negative.success).toBe(false);
  });

  it('formValuesToApiPayload converts values to cents correctly', () => {
    const fixedPayload = formValuesToApiPayload({
      ...validBase,
      priceType: 'FIXED',
      priceMin: 55.25,
      tags: ['react'],
      imageIds: ['img-1'],
      attachmentIds: ['att-1'],
      status: 'OPEN',
    });
    expect(fixedPayload.priceMinCents).toBe(5525);
    expect(fixedPayload.priceMaxCents).toBe(5525);

    const rangePayload = formValuesToApiPayload({
      ...validBase,
      priceType: 'RANGE',
      priceMin: 50,
      priceMax: 150,
      tags: [],
      imageIds: [],
      attachmentIds: [],
      status: 'OPEN',
    });
    expect(rangePayload.priceMinCents).toBe(5000);
    expect(rangePayload.priceMaxCents).toBe(15000);

    const negPayload = formValuesToApiPayload({
      ...validBase,
      priceType: 'NEGOTIABLE',
      tags: [],
      imageIds: [],
      attachmentIds: [],
      status: 'OPEN',
    });
    expect(negPayload.priceMinCents).toBeUndefined();
    expect(negPayload.priceMaxCents).toBeUndefined();
  });
});
