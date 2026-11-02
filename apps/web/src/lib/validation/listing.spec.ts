import { describe, it, expect } from 'vitest';
import { formValuesToApiPayload, formValuesToUpdatePayload, listingFormSchema } from './listing';

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

  it('validates that expiresAt must be in the future', () => {
    const pastDate = new Date(Date.now() - 24 * 3600 * 1000).toISOString().split('T')[0]!;
    const pastRes = listingFormSchema.safeParse({
      ...validBase,
      priceType: 'FIXED',
      priceMin: 20,
      expiresAt: pastDate,
    });
    expect(pastRes.success).toBe(false);
    if (!pastRes.success) {
      expect(pastRes.error.issues[0]?.message).toBe('Expiration date must be in the future');
    }

    const futureDate = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0]!;
    const futureRes = listingFormSchema.safeParse({
      ...validBase,
      priceType: 'FIXED',
      priceMin: 20,
      expiresAt: futureDate,
    });
    expect(futureRes.success).toBe(true);
  });

  it('formValuesToApiPayload converts values to cents correctly and does not send priceMaxCents for FIXED', () => {
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
    expect(fixedPayload.priceMaxCents).toBeUndefined();

    // 19.99 -> 1999 test
    const decimalPayload = formValuesToApiPayload({
      ...validBase,
      priceType: 'FIXED',
      priceMin: 19.99,
    });
    expect(decimalPayload.priceMinCents).toBe(1999);
    expect(decimalPayload.priceMaxCents).toBeUndefined();

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

  describe('formValuesToUpdatePayload (Finding 4)', () => {
    it('clears priceMaxCents when switching to FIXED or clears both when switching to NEGOTIABLE', () => {
      // Switching to FIXED sends priceMaxCents: null
      const fixedUpdate = formValuesToUpdatePayload({
        ...validBase,
        priceType: 'FIXED',
        priceMin: 19.99,
      });
      expect(fixedUpdate.priceMinCents).toBe(1999);
      expect(fixedUpdate.priceMaxCents).toBeNull();

      // Switching to NEGOTIABLE sends null for both
      const negUpdate = formValuesToUpdatePayload({
        ...validBase,
        priceType: 'NEGOTIABLE',
      });
      expect(negUpdate.priceMinCents).toBeNull();
      expect(negUpdate.priceMaxCents).toBeNull();

      // RANGE sets both
      const rangeUpdate = formValuesToUpdatePayload({
        ...validBase,
        priceType: 'RANGE',
        priceMin: 25.5,
        priceMax: 75.0,
      });
      expect(rangeUpdate.priceMinCents).toBe(2550);
      expect(rangeUpdate.priceMaxCents).toBe(7500);
    });

    it('sends empty arrays for emptied collections and null for cleared scalars', () => {
      const updatePayload = formValuesToUpdatePayload({
        ...validBase,
        priceType: 'NEGOTIABLE',
        tags: [],
        imageIds: [],
        attachmentIds: [],
        location: '',
        deliveryDays: undefined,
        expiresAt: undefined,
      });

      expect(updatePayload.tags).toEqual([]);
      expect(updatePayload.imageIds).toEqual([]);
      expect(updatePayload.attachmentIds).toEqual([]);
      expect(updatePayload.location).toBeNull();
      expect(updatePayload.deliveryDays).toBeNull();
      expect(updatePayload.expiresAt).toBeNull();
    });

    it('does not include status unless statusOverride is explicitly provided', () => {
      const updateWithoutStatus = formValuesToUpdatePayload({
        ...validBase,
        priceType: 'FIXED',
        priceMin: 10,
        status: 'OPEN',
      });
      expect(updateWithoutStatus.status).toBeUndefined();

      const updateWithStatus = formValuesToUpdatePayload(
        {
          ...validBase,
          priceType: 'FIXED',
          priceMin: 10,
        },
        'DRAFT',
      );
      expect(updateWithStatus.status).toBe('DRAFT');
    });
  });
});
