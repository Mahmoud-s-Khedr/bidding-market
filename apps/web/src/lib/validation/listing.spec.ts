import { describe, it, expect } from 'vitest';
import {
  createListingFormSchema,
  formValuesToApiPayload,
  formValuesToUpdatePayload,
  listingFormSchema,
} from './listing';

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

    const overMax = listingFormSchema.safeParse({
      ...validBase,
      priceType: 'NEGOTIABLE',
      deliveryDays: 3651,
    });
    expect(overMax.success).toBe(false);
    if (!overMax.success) {
      expect(overMax.error.issues[0]?.message).toBe('Delivery days cannot exceed 3,650');
    }

    const atMax = listingFormSchema.safeParse({
      ...validBase,
      priceType: 'NEGOTIABLE',
      deliveryDays: 3650,
    });
    expect(atMax.success).toBe(true);
  });

  it('enforces int4 max limit on price inputs (21,474,836.47)', () => {
    const validAtMax = listingFormSchema.safeParse({
      ...validBase,
      priceType: 'FIXED',
      priceMin: 21474836.47,
    });
    expect(validAtMax.success).toBe(true);

    const overFixed = listingFormSchema.safeParse({
      ...validBase,
      priceType: 'FIXED',
      priceMin: 21474836.48,
    });
    expect(overFixed.success).toBe(false);
    if (!overFixed.success) {
      expect(overFixed.error.issues[0]?.message).toBe('Price cannot exceed 21,474,836.47');
    }

    const overRangeMin = listingFormSchema.safeParse({
      ...validBase,
      priceType: 'RANGE',
      priceMin: 21474836.48,
      priceMax: 21474836.48,
    });
    expect(overRangeMin.success).toBe(false);
    if (!overRangeMin.success) {
      expect(overRangeMin.error.issues[0]?.message).toBe(
        'Minimum price cannot exceed 21,474,836.47',
      );
    }

    const overRangeMax = listingFormSchema.safeParse({
      ...validBase,
      priceType: 'RANGE',
      priceMin: 100,
      priceMax: 21474836.48,
    });
    expect(overRangeMax.success).toBe(false);
    if (!overRangeMax.success) {
      expect(overRangeMax.error.issues[0]?.message).toBe(
        'Maximum price cannot exceed 21,474,836.47',
      );
    }
  });

  it('validates that expiresAt must be strictly in the future (today is rejected)', () => {
    // "today" rejected
    const today = new Date();
    const todayY = today.getFullYear();
    const todayM = String(today.getMonth() + 1).padStart(2, '0');
    const todayD = String(today.getDate()).padStart(2, '0');
    const todayStr = `${todayY}-${todayM}-${todayD}`;

    const todayRes = listingFormSchema.safeParse({
      ...validBase,
      priceType: 'FIXED',
      priceMin: 20,
      expiresAt: todayStr,
    });
    expect(todayRes.success).toBe(false);
    if (!todayRes.success) {
      expect(todayRes.error.issues[0]?.message).toBe('Expiration date must be in the future');
    }

    // Past date rejected
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

    // Tomorrow accepted
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowY = tomorrow.getFullYear();
    const tomorrowM = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const tomorrowD = String(tomorrow.getDate()).padStart(2, '0');
    const tomorrowStr = `${tomorrowY}-${tomorrowM}-${tomorrowD}`;

    const futureRes = listingFormSchema.safeParse({
      ...validBase,
      priceType: 'FIXED',
      priceMin: 20,
      expiresAt: tomorrowStr,
    });
    expect(futureRes.success).toBe(true);
  });

  it('skips the future-date check when the expiry equals the initial value', () => {
    // A stored past date
    const pastDate = '2025-01-01';
    const schemaWithPastInitial = createListingFormSchema(pastDate);

    // Editing with the same past date succeeds
    const sameRes = schemaWithPastInitial.safeParse({
      ...validBase,
      priceType: 'FIXED',
      priceMin: 20,
      expiresAt: pastDate,
    });
    expect(sameRes.success).toBe(true);

    // Editing with a different past date still fails
    const diffPastRes = schemaWithPastInitial.safeParse({
      ...validBase,
      priceType: 'FIXED',
      priceMin: 20,
      expiresAt: '2024-12-31',
    });
    expect(diffPastRes.success).toBe(false);
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

  it('tomorrow in formValuesToApiPayload converts to local 23:59:59.999 as ISO timestamp', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowY = tomorrow.getFullYear();
    const tomorrowM = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const tomorrowD = String(tomorrow.getDate()).padStart(2, '0');
    const tomorrowStr = `${tomorrowY}-${tomorrowM}-${tomorrowD}`;

    const expectedIso = new Date(
      tomorrow.getFullYear(),
      tomorrow.getMonth(),
      tomorrow.getDate(),
      23,
      59,
      59,
      999,
    ).toISOString();

    const payload = formValuesToApiPayload({
      ...validBase,
      priceType: 'FIXED',
      priceMin: 50,
      expiresAt: tomorrowStr,
    });

    expect(payload.expiresAt).toBe(expectedIso);
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

    it('does not send unchanged expiresAt on edit, but sends new ISO when changed', () => {
      const initialIso = '2026-11-20T21:59:59.999Z';
      const initialDate = new Date(initialIso);
      const y = initialDate.getFullYear();
      const m = String(initialDate.getMonth() + 1).padStart(2, '0');
      const d = String(initialDate.getDate()).padStart(2, '0');
      const initialLocalDateStr = `${y}-${m}-${d}`;

      // When expiresAt matches initial local date string -> NOT sent
      const unchangedUpdate = formValuesToUpdatePayload(
        {
          ...validBase,
          priceType: 'FIXED',
          priceMin: 10,
          expiresAt: initialLocalDateStr,
        },
        undefined,
        initialIso,
      );
      expect(unchangedUpdate.expiresAt).toBeUndefined();
      expect('expiresAt' in unchangedUpdate).toBe(false);

      // When expiresAt changed to a different date -> sent as local end of day ISO
      const changedUpdate = formValuesToUpdatePayload(
        {
          ...validBase,
          priceType: 'FIXED',
          priceMin: 10,
          expiresAt: '2026-11-25',
        },
        undefined,
        initialIso,
      );
      expect(changedUpdate.expiresAt).toBeDefined();
      const expectedNewIso = new Date(2026, 10, 25, 23, 59, 59, 999).toISOString();
      expect(changedUpdate.expiresAt).toBe(expectedNewIso);

      // When expiresAt cleared -> sent as null
      const clearedUpdate = formValuesToUpdatePayload(
        {
          ...validBase,
          priceType: 'FIXED',
          priceMin: 10,
          expiresAt: '',
        },
        undefined,
        initialIso,
      );
      expect(clearedUpdate.expiresAt).toBeNull();
    });
  });
});
