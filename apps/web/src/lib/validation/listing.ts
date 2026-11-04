import { z } from 'zod';
import { listingCreateSchema, type ListingCreateInput } from '@market/shared';
import type { UpdateListingRequest } from '@/lib/api/types';

export const MAX_PRICE_MAJOR = 21474836.47;

export function isStrictlyFutureDate(dateStr: string): boolean {
  if (!dateStr) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const parts = dateStr.split('-').map(Number);
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];
    if (year === undefined || month === undefined || day === undefined) return false;
    const inputDate = new Date(year, month - 1, day, 0, 0, 0, 0);
    if (Number.isNaN(inputDate.getTime())) return false;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    return inputDate.getTime() > today.getTime();
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() > Date.now();
}

export function toLocalDateString(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatExpiryToIso(dateStr?: string | null): string | undefined {
  if (!dateStr) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const parts = dateStr.split('-').map(Number);
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];
    if (year === undefined || month === undefined || day === undefined) return undefined;
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
    return endOfDay.toISOString();
  }
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

const {
  priceMinCents: _priceMinCents,
  priceMaxCents: _priceMaxCents,
  ...sharedFields
} = listingCreateSchema.shape;

export function createListingFormSchema(initialExpiresAt?: string | Date | null) {
  const initialLocalStr = initialExpiresAt ? toLocalDateString(initialExpiresAt) : undefined;

  return z
    .object({
      ...sharedFields,
      categoryId: z.string().min(1, 'Please select a category'),
      priceMin: z
        .union([z.number(), z.string()])
        .optional()
        .transform((val) =>
          val === '' || val === undefined || val === null ? undefined : Number(val),
        ),
      priceMax: z
        .union([z.number(), z.string()])
        .optional()
        .transform((val) =>
          val === '' || val === undefined || val === null ? undefined : Number(val),
        ),
      deliveryDays: z
        .union([z.number(), z.string()])
        .optional()
        .transform((val) =>
          val === '' || val === undefined || val === null ? undefined : Number(val),
        ),
      tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
      imageIds: z.array(z.string()).default([]),
      attachmentIds: z.array(z.string()).default([]),
      expiresAt: z.string().optional(),
      status: z.enum(['DRAFT', 'OPEN']).default('OPEN'),
    })
    .superRefine((data, ctx) => {
      if (data.priceType === 'FIXED') {
        if (data.priceMin === undefined || Number.isNaN(data.priceMin) || data.priceMin < 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Please enter a valid price',
            path: ['priceMin'],
          });
        } else if (data.priceMin > MAX_PRICE_MAJOR) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Price cannot exceed 21,474,836.47',
            path: ['priceMin'],
          });
        }
      } else if (data.priceType === 'RANGE') {
        if (data.priceMin === undefined || Number.isNaN(data.priceMin) || data.priceMin < 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Please enter a valid minimum price',
            path: ['priceMin'],
          });
        } else if (data.priceMin > MAX_PRICE_MAJOR) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Minimum price cannot exceed 21,474,836.47',
            path: ['priceMin'],
          });
        }
        if (data.priceMax === undefined || Number.isNaN(data.priceMax) || data.priceMax < 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Please enter a valid maximum price',
            path: ['priceMax'],
          });
        } else if (data.priceMax > MAX_PRICE_MAJOR) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Maximum price cannot exceed 21,474,836.47',
            path: ['priceMax'],
          });
        }
        if (
          data.priceMin !== undefined &&
          data.priceMax !== undefined &&
          !Number.isNaN(data.priceMin) &&
          !Number.isNaN(data.priceMax) &&
          data.priceMax < data.priceMin
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Maximum price must be greater than or equal to minimum price',
            path: ['priceMax'],
          });
        }
      }

      if (
        data.deliveryDays !== undefined &&
        (Number.isNaN(data.deliveryDays) ||
          data.deliveryDays < 1 ||
          !Number.isInteger(data.deliveryDays))
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Delivery days must be a positive integer',
          path: ['deliveryDays'],
        });
      } else if (data.deliveryDays !== undefined && data.deliveryDays > 3650) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Delivery days cannot exceed 3,650',
          path: ['deliveryDays'],
        });
      }

      if (data.expiresAt) {
        const expDate = new Date(data.expiresAt);
        if (Number.isNaN(expDate.getTime())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Invalid expiration date',
            path: ['expiresAt'],
          });
        } else if (
          (!initialLocalStr || data.expiresAt !== initialLocalStr) &&
          !isStrictlyFutureDate(data.expiresAt)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Expiration date must be in the future',
            path: ['expiresAt'],
          });
        }
      }
    });
}

export const listingFormSchema = createListingFormSchema();

export type ListingFormValues = z.input<typeof listingFormSchema>;
export type ListingFormOutput = z.output<typeof listingFormSchema>;

export function formValuesToApiPayload(
  values: Partial<ListingFormOutput> &
    Pick<ListingFormOutput, 'kind' | 'title' | 'description' | 'categoryId' | 'priceType'>,
  statusOverride?: 'DRAFT' | 'OPEN',
): ListingCreateInput {
  let priceMinCents: number | undefined = undefined;
  let priceMaxCents: number | undefined = undefined;

  if (values.priceType === 'FIXED') {
    if (values.priceMin !== undefined && !Number.isNaN(values.priceMin)) {
      priceMinCents = Math.round(values.priceMin * 100);
      priceMaxCents = undefined;
    }
  } else if (values.priceType === 'RANGE') {
    if (values.priceMin !== undefined && !Number.isNaN(values.priceMin)) {
      priceMinCents = Math.round(values.priceMin * 100);
    }
    if (values.priceMax !== undefined && !Number.isNaN(values.priceMax)) {
      priceMaxCents = Math.round(values.priceMax * 100);
    }
  }

  let formattedExpiresAt: string | undefined = undefined;
  if (values.expiresAt) {
    formattedExpiresAt = formatExpiryToIso(values.expiresAt);
  }

  return {
    kind: values.kind,
    title: values.title.trim(),
    description: values.description.trim(),
    categoryId: values.categoryId,
    priceType: values.priceType,
    priceMinCents,
    priceMaxCents,
    currency: values.currency || 'USD',
    deliveryDays: values.deliveryDays,
    location: values.location?.trim() || undefined,
    tags: values.tags && values.tags.length > 0 ? values.tags : undefined,
    imageIds: values.imageIds && values.imageIds.length > 0 ? values.imageIds : undefined,
    attachmentIds:
      values.attachmentIds && values.attachmentIds.length > 0 ? values.attachmentIds : undefined,
    expiresAt: formattedExpiresAt,
    status: statusOverride ?? values.status ?? 'OPEN',
  };
}

export function formValuesToUpdatePayload(
  values: Partial<ListingFormOutput> &
    Pick<ListingFormOutput, 'kind' | 'title' | 'description' | 'categoryId' | 'priceType'>,
  statusOverride?: 'DRAFT' | 'OPEN',
  initialExpiresAt?: Date | string | null,
): UpdateListingRequest {
  let priceMinCents: number | null | undefined = undefined;
  let priceMaxCents: number | null | undefined = undefined;

  if (values.priceType === 'FIXED') {
    priceMinCents =
      values.priceMin !== undefined && !Number.isNaN(values.priceMin)
        ? Math.round(values.priceMin * 100)
        : null;
    priceMaxCents = null;
  } else if (values.priceType === 'RANGE') {
    priceMinCents =
      values.priceMin !== undefined && !Number.isNaN(values.priceMin)
        ? Math.round(values.priceMin * 100)
        : null;
    priceMaxCents =
      values.priceMax !== undefined && !Number.isNaN(values.priceMax)
        ? Math.round(values.priceMax * 100)
        : null;
  } else if (values.priceType === 'NEGOTIABLE') {
    priceMinCents = null;
    priceMaxCents = null;
  }

  const isExpiryChanged =
    initialExpiresAt !== undefined
      ? !initialExpiresAt
        ? Boolean(values.expiresAt)
        : toLocalDateString(initialExpiresAt) !== (values.expiresAt || '')
      : true;

  let formattedExpiresAt: string | null | undefined = undefined;
  if (isExpiryChanged) {
    if (values.expiresAt) {
      formattedExpiresAt = formatExpiryToIso(values.expiresAt) ?? null;
    } else {
      formattedExpiresAt = null;
    }
  }

  const payload: UpdateListingRequest = {
    kind: values.kind,
    title: values.title?.trim(),
    description: values.description?.trim(),
    categoryId: values.categoryId,
    priceType: values.priceType,
    priceMinCents,
    priceMaxCents,
    currency: values.currency || 'USD',
    deliveryDays: values.deliveryDays ?? null,
    location: values.location?.trim() ? values.location.trim() : null,
    tags: values.tags ?? [],
    imageIds: values.imageIds ?? [],
    attachmentIds: values.attachmentIds ?? [],
  };

  if (isExpiryChanged) {
    payload.expiresAt = formattedExpiresAt;
  }

  if (statusOverride !== undefined) {
    payload.status = statusOverride;
  }

  return payload;
}
