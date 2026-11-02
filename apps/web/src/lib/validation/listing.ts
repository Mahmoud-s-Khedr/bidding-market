import { z } from 'zod';
import type { CreateListingRequest } from '@/lib/api/types';

export const listingFormSchema = z
  .object({
    kind: z.enum(['REQUEST', 'OFFER'], {
      message: 'Please select whether this is a request or an offer',
    }),
    title: z
      .string()
      .trim()
      .min(5, 'Title must be at least 5 characters')
      .max(120, 'Title cannot exceed 120 characters'),
    description: z
      .string()
      .trim()
      .min(20, 'Description must be at least 20 characters')
      .max(10000, 'Description cannot exceed 10,000 characters'),
    categoryId: z.string().min(1, 'Please select a category'),
    priceType: z.enum(['FIXED', 'RANGE', 'NEGOTIABLE']),
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
    currency: z.string().min(3).max(3).default('USD'),
    deliveryDays: z
      .union([z.number(), z.string()])
      .optional()
      .transform((val) =>
        val === '' || val === undefined || val === null ? undefined : Number(val),
      ),
    location: z.string().trim().max(120).optional(),
    tags: z.array(z.string().trim().min(1)).max(10, 'Maximum 10 tags allowed').default([]),
    imageIds: z.array(z.string()).max(10, 'Maximum 10 images allowed').default([]),
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
  });

export type ListingFormValues = z.input<typeof listingFormSchema>;
export type ListingFormOutput = z.output<typeof listingFormSchema>;

export function formValuesToApiPayload(
  values: Partial<ListingFormOutput> &
    Pick<ListingFormOutput, 'kind' | 'title' | 'description' | 'categoryId' | 'priceType'>,
  statusOverride?: 'DRAFT' | 'OPEN',
): CreateListingRequest {
  let priceMinCents: number | null | undefined = undefined;
  let priceMaxCents: number | null | undefined = undefined;

  if (values.priceType === 'FIXED') {
    if (values.priceMin !== undefined && !Number.isNaN(values.priceMin)) {
      priceMinCents = Math.round(values.priceMin * 100);
      priceMaxCents = priceMinCents;
    }
  } else if (values.priceType === 'RANGE') {
    if (values.priceMin !== undefined && !Number.isNaN(values.priceMin)) {
      priceMinCents = Math.round(values.priceMin * 100);
    }
    if (values.priceMax !== undefined && !Number.isNaN(values.priceMax)) {
      priceMaxCents = Math.round(values.priceMax * 100);
    }
  } else {
    priceMinCents = null;
    priceMaxCents = null;
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
    location: values.location?.trim() || null,
    tags: values.tags,
    imageIds: values.imageIds,
    attachmentIds: values.attachmentIds,
    expiresAt: values.expiresAt || null,
    status: statusOverride ?? values.status ?? 'OPEN',
  };
}
