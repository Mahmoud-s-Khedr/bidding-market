import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Calendar, DollarSign, Layers } from 'lucide-react';
import {
  listingFormSchema,
  formValuesToApiPayload,
  type ListingFormOutput,
  type ListingFormValues,
} from '@/lib/validation/listing';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CategorySelect } from '@/components/shared/category-select';
import { TagsInput } from '@/components/shared/tags-input';
import { FileDropzone } from '@/components/ui/file-dropzone';
import { ApiError } from '@/lib/api/client';
import type { Attachment, CreateListingRequest, ListingDetail } from '@/lib/api/types';

export interface ListingFormProps {
  initialListing?: ListingDetail;
  onSubmit: (data: CreateListingRequest) => Promise<void>;
  isLoading?: boolean;
}

export function ListingForm({ initialListing, onSubmit, isLoading = false }: ListingFormProps) {
  const [images, setImages] = React.useState<Attachment[]>(initialListing?.images || []);
  const [attachments, setAttachments] = React.useState<Attachment[]>(
    initialListing?.attachments || [],
  );
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Convert initial cents to major units for form
  const initialPriceMin =
    initialListing?.priceMinCents !== undefined && initialListing?.priceMinCents !== null
      ? initialListing.priceMinCents / 100
      : undefined;
  const initialPriceMax =
    initialListing?.priceMaxCents !== undefined && initialListing?.priceMaxCents !== null
      ? initialListing.priceMaxCents / 100
      : undefined;

  const initialExpiresAt = initialListing?.expiresAt
    ? new Date(initialListing.expiresAt).toISOString().split('T')[0]
    : undefined;

  const form = useForm<ListingFormValues, unknown, ListingFormOutput>({
    resolver: zodResolver(listingFormSchema),
    defaultValues: {
      kind: initialListing?.kind || 'REQUEST',
      title: initialListing?.title || '',
      description: initialListing?.description || '',
      categoryId: initialListing?.categoryId || initialListing?.category?.id || '',
      priceType: initialListing?.priceType || 'FIXED',
      priceMin: initialPriceMin,
      priceMax: initialPriceMax,
      currency: initialListing?.currency || 'USD',
      deliveryDays: initialListing?.deliveryDays ?? undefined,
      location: initialListing?.location || '',
      tags: initialListing?.tags || [],
      imageIds: initialListing?.images?.map((img) => img.id) || [],
      attachmentIds: initialListing?.attachments?.map((att) => att.id) || [],
      expiresAt: initialExpiresAt,
      status: initialListing?.status === 'DRAFT' ? 'DRAFT' : 'OPEN',
    },
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = form;

  const watchedKind = watch('kind');
  const watchedPriceType = watch('priceType');
  const watchedDescription = watch('description') || '';

  const handleFormSubmit = async (values: ListingFormOutput, statusOverride?: 'DRAFT' | 'OPEN') => {
    setServerError(null);

    const payload = formValuesToApiPayload(
      {
        ...values,
        imageIds: images.map((img) => img.id),
        attachmentIds: attachments.map((att) => att.id),
      },
      statusOverride,
    );

    try {
      await onSubmit(payload);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === 'VALIDATION_ERROR' && err.details) {
          if (Array.isArray(err.details)) {
            let mappedAny = false;
            for (const item of err.details) {
              if (item && typeof item === 'object') {
                const itemObj = item as Record<string, unknown>;
                const pathArray = Array.isArray(itemObj.path) ? itemObj.path : [];
                const fieldName = (pathArray[0] || itemObj.field) as keyof ListingFormValues;
                const msg = (itemObj.message || itemObj.error || err.message) as string;
                if (fieldName) {
                  setError(fieldName, { message: msg });
                  mappedAny = true;
                }
              }
            }
            if (!mappedAny) {
              setServerError(err.message);
            }
            return;
          } else if (typeof err.details === 'object') {
            for (const [key, msg] of Object.entries(err.details as Record<string, unknown>)) {
              if (typeof msg === 'string') {
                setError(key as keyof ListingFormValues, { message: msg });
              }
            }
            return;
          }
        }
        setServerError(err.message);
      } else if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError('An unexpected error occurred. Please try again.');
      }
    }
  };

  return (
    <form
      noValidate
      className="space-y-8"
      onSubmit={(e) => {
        void handleSubmit((values) => handleFormSubmit(values, 'OPEN'))(e);
      }}
    >
      {serverError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      {/* Kind selector */}
      <div className="space-y-2">
        <span className="text-sm font-medium text-foreground block">Listing Kind</span>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            role="radio"
            aria-checked={watchedKind === 'REQUEST'}
            onClick={() => setValue('kind', 'REQUEST', { shouldValidate: true })}
            className={`flex flex-col items-center justify-center rounded-lg border p-4 text-center transition-all ${
              watchedKind === 'REQUEST'
                ? 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary'
                : 'border-border bg-card text-muted-foreground hover:border-primary/40'
            }`}
          >
            <span className="text-base">Request</span>
            <span className="text-xs font-normal opacity-80 mt-1">
              I need a product or service fulfilled
            </span>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={watchedKind === 'OFFER'}
            onClick={() => setValue('kind', 'OFFER', { shouldValidate: true })}
            className={`flex flex-col items-center justify-center rounded-lg border p-4 text-center transition-all ${
              watchedKind === 'OFFER'
                ? 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary'
                : 'border-border bg-card text-muted-foreground hover:border-primary/40'
            }`}
          >
            <span className="text-base">Offer</span>
            <span className="text-xs font-normal opacity-80 mt-1">
              I am offering or selling a product / service
            </span>
          </button>
        </div>
        {errors.kind && (
          <p role="alert" className="text-xs font-medium text-destructive">
            {errors.kind.message}
          </p>
        )}
      </div>

      {/* Title */}
      <FormField
        id="listing-title"
        label="Title"
        required
        error={errors.title?.message}
        hint="Summarize what you need or what you offer in 5 to 120 characters."
      >
        <Input
          {...register('title')}
          placeholder="e.g. Need high-performance Next.js web application with Tailwind"
          maxLength={120}
        />
      </FormField>

      {/* Description with character counter */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="listing-description" className="text-sm font-medium text-foreground">
            Description <span className="text-destructive">*</span>
          </label>
          <span
            className={`text-xs ${
              watchedDescription.length < 20 || watchedDescription.length > 10000
                ? 'text-muted-foreground'
                : 'text-muted-foreground'
            }`}
          >
            {watchedDescription.length} / 10,000 characters
          </span>
        </div>
        <Textarea
          id="listing-description"
          {...register('description')}
          placeholder="Describe scope, requirements, deliverables, specifications..."
          rows={6}
          error={!!errors.description}
          aria-invalid={errors.description ? 'true' : undefined}
          aria-describedby={errors.description ? 'listing-description-error' : undefined}
        />
        {errors.description && (
          <p
            id="listing-description-error"
            role="alert"
            className="text-xs font-medium text-destructive"
          >
            {errors.description.message}
          </p>
        )}
      </div>

      {/* Category Select */}
      <FormField id="listing-category" label="Category" required error={errors.categoryId?.message}>
        <Controller
          name="categoryId"
          control={control}
          render={({ field }) => (
            <CategorySelect
              id="listing-category"
              value={field.value}
              onValueChange={field.onChange}
              error={!!errors.categoryId}
              aria-describedby={errors.categoryId ? 'listing-category-error' : undefined}
              aria-invalid={errors.categoryId ? 'true' : undefined}
            />
          )}
        />
      </FormField>

      {/* Pricing Section */}
      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <DollarSign className="h-4 w-4 text-primary" />
          <span>Pricing & Budget</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField id="listing-price-type" label="Price Type" error={errors.priceType?.message}>
            <Controller
              name="priceType"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="listing-price-type">
                    <SelectValue placeholder="Select price type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED">Fixed Price</SelectItem>
                    <SelectItem value="RANGE">Price Range</SelectItem>
                    <SelectItem value="NEGOTIABLE">Negotiable</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>

          <FormField id="listing-currency" label="Currency" error={errors.currency?.message}>
            <Controller
              name="currency"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="listing-currency">
                    <SelectValue placeholder="USD" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="GBP">GBP (£)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>

          {watchedPriceType === 'FIXED' && (
            <FormField
              id="listing-price-fixed"
              label="Price ($)"
              required
              error={errors.priceMin?.message}
              hint="Major units (e.g. 50.00)"
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="50.00"
                {...register('priceMin')}
              />
            </FormField>
          )}
        </div>

        {watchedPriceType === 'RANGE' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              id="listing-price-min"
              label="Min Price ($)"
              required
              error={errors.priceMin?.message}
              hint="Major units"
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="100.00"
                {...register('priceMin')}
              />
            </FormField>

            <FormField
              id="listing-price-max"
              label="Max Price ($)"
              required
              error={errors.priceMax?.message}
              hint="Major units"
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="250.00"
                {...register('priceMax')}
              />
            </FormField>
          </div>
        )}

        {watchedPriceType === 'NEGOTIABLE' && (
          <p className="text-xs text-muted-foreground">
            Price is negotiable and will be agreed upon during bidding and counter-offers.
          </p>
        )}
      </div>

      {/* Delivery & Logistics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          id="listing-delivery-days"
          label="Estimated Delivery (Days)"
          error={errors.deliveryDays?.message}
          hint="Target completion timeframe"
        >
          <Input
            type="number"
            min="1"
            step="1"
            placeholder="e.g. 7"
            {...register('deliveryDays')}
          />
        </FormField>

        <FormField
          id="listing-location"
          label="Location"
          error={errors.location?.message}
          hint="City, region, or leave empty for remote"
        >
          <Input placeholder="e.g. Remote / New York, NY" {...register('location')} />
        </FormField>
      </div>

      {/* Tags */}
      <FormField
        id="listing-tags"
        label="Tags"
        error={errors.tags?.message}
        hint="Add up to 10 keywords separated by Enter or commas."
      >
        <Controller
          name="tags"
          control={control}
          render={({ field }) => (
            <TagsInput
              id="listing-tags"
              value={field.value}
              onChange={field.onChange}
              maxTags={10}
            />
          )}
        />
      </FormField>

      {/* Expiry Date */}
      <FormField
        id="listing-expires-at"
        label="Listing Expiration Date"
        error={errors.expiresAt?.message}
        hint="Optional date when this listing will stop accepting bids."
      >
        <div className="relative">
          <Input type="date" {...register('expiresAt')} className="pl-10" />
          <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
        </div>
      </FormField>

      {/* Images Upload */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Layers className="h-4 w-4 text-primary" />
          <span>Listing Images (up to 10)</span>
        </div>
        <FileDropzone
          purpose="LISTING_IMAGE"
          maxFiles={10}
          value={images}
          onChange={(newImages) => {
            setImages(newImages);
            setValue(
              'imageIds',
              newImages.map((img) => img.id),
            );
          }}
          label="Upload listing images"
        />
      </div>

      {/* Attachments Upload */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Layers className="h-4 w-4 text-primary" />
          <span>Documents & Specifications</span>
        </div>
        <FileDropzone
          purpose="LISTING_ATTACHMENT"
          maxFiles={10}
          value={attachments}
          onChange={(newAttachments) => {
            setAttachments(newAttachments);
            setValue(
              'attachmentIds',
              newAttachments.map((att) => att.id),
            );
          }}
          label="Upload specifications or reference documents"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-6 border-t border-border">
        <Button
          type="button"
          variant="outline"
          disabled={isLoading}
          onClick={(e) => {
            void handleSubmit((values) => handleFormSubmit(values, 'DRAFT'))(e);
          }}
          className="w-full sm:w-auto"
        >
          Save Draft
        </Button>

        <Button
          type="submit"
          disabled={isLoading}
          isLoading={isLoading}
          className="w-full sm:w-auto"
        >
          {initialListing ? 'Save Changes' : 'Publish Listing'}
        </Button>
      </div>
    </form>
  );
}
