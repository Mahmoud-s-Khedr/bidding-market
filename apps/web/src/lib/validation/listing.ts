import { z } from 'zod';
import { listingCreateSchema, type ListingCreateInput } from '@market/shared';
import type { UpdateListingRequest } from '@/lib/api/types';

const {
  priceMinCents: _priceMinCents,
  priceMaxCents: _priceMaxCents,
  ...sharedFields
} = listingCreateSchema.shape;

export const listingFormSchema = z
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
      }
    } else if (data.priceType === 'RANGE') {
      if (data.priceMin === undefined || Number.isNaN(data.priceMin) || data.priceMin < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Please enter a valid minimum price',
          path: ['priceMin'],
        });
      }
      if (data.priceMax === undefined || Number.isNaN(data.priceMax) || data.priceMax < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Please enter a valid maximum price',
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
    }

    if (data.expiresAt) {
      const expDate = new Date(data.expiresAt);
      if (Number.isNaN(expDate.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid expiration date',
          path: ['expiresAt'],
        });
      } else {
        const isPast =
          expDate.getTime() <= Date.now() &&
          !(
            data.expiresAt.length === 10 &&
            new Date(`${data.expiresAt}T23:59:59.999Z`).getTime() > Date.now()
          );
        if (isPast) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Expiration date must be in the future',
            path: ['expiresAt'],
          });
        }
      }
    }
  });

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
    const d = new Date(values.expiresAt);
    if (!Number.isNaN(d.getTime())) {
      formattedExpiresAt = d.toISOString();
    }
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

  let formattedExpiresAt: string | null = null;
  if (values.expiresAt) {
    const d = new Date(values.expiresAt);
    if (!Number.isNaN(d.getTime())) {
      formattedExpiresAt = d.toISOString();
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
    expiresAt: formattedExpiresAt,
  };

  if (statusOverride !== undefined) {
    payload.status = statusOverride;
  }

  return payload;
}
