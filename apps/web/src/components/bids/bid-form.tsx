'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/ui/form-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileDropzone } from '@/components/ui/file-dropzone';
import { PriceTag } from '@/components/shared/price-tag';
import { ApiError } from '@/lib/api/client';
import { getCurrencySymbol } from '@/lib/format';
import type { Attachment, Bid, BidCreateInput, ListingDetail } from '@/lib/api/types';

export const bidFormSchema = z.object({
  amount: z
    .union([z.number(), z.string()])
    .refine((v) => v !== '' && v !== undefined && v !== null && !Number.isNaN(Number(v)), {
      message: 'Please enter a valid bid amount',
    })
    .transform((v) => Number(v))
    .refine((v) => v > 0, { message: 'Bid amount must be greater than zero' })
    .refine((v) => v <= 21474836.47, { message: 'Bid amount cannot exceed 21,474,836.47' }),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default('USD'),
  deliveryDays: z
    .union([z.number(), z.string()])
    .refine((v) => v !== '' && v !== undefined && v !== null && !Number.isNaN(Number(v)), {
      message: 'Please enter delivery days',
    })
    .transform((v) => Number(v))
    .refine((v) => Number.isInteger(v) && v >= 1, {
      message: 'Delivery days must be a positive integer',
    })
    .refine((v) => v <= 3650, {
      message: 'Delivery days cannot exceed 3,650',
    }),
  message: z.string().trim().max(5000, 'Message cannot exceed 5000 characters'),
  attachmentIds: z.array(z.string()).default([]),
});

export type BidFormValues = z.input<typeof bidFormSchema>;
export type BidFormOutput = z.output<typeof bidFormSchema>;

export interface BidFormProps {
  listing: Pick<
    ListingDetail,
    'id' | 'priceType' | 'priceMinCents' | 'priceMaxCents' | 'currency' | 'deliveryDays'
  >;
  initialBid?: Partial<Bid> | null;
  onSubmit: (payload: BidCreateInput) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

export function BidForm({
  listing,
  initialBid,
  onSubmit,
  onCancel,
  isLoading = false,
}: BidFormProps) {
  const isEditing = Boolean(initialBid?.id);
  const [attachments, setAttachments] = React.useState<Attachment[]>(initialBid?.attachments || []);
  const [attachmentsTouched, setAttachmentsTouched] = React.useState(false);
  const [inFlightUploads, setInFlightUploads] = React.useState(0);
  const [serverError, setServerError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (initialBid?.attachments && !attachmentsTouched) {
      setAttachments(initialBid.attachments);
    }
  }, [initialBid?.attachments, attachmentsTouched]);

  const initialAmountMajor =
    initialBid?.amountCents !== undefined && initialBid.amountCents !== null
      ? initialBid.amountCents / 100
      : undefined;

  const form = useForm<BidFormValues, unknown, BidFormOutput>({
    resolver: zodResolver(bidFormSchema),
    defaultValues: {
      amount: initialAmountMajor,
      currency: initialBid?.currency || listing.currency || 'USD',
      deliveryDays: initialBid?.deliveryDays ?? listing.deliveryDays ?? 7,
      message: initialBid?.message || '',
      attachmentIds: initialBid?.attachments?.map((a) => a.id) || [],
    },
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = form;

  const watchedMessage = watch('message') || '';
  const messageLength = watchedMessage.length;
  const watchedCurrency = watch('currency') || listing.currency || 'USD';
  const currencySymbol = getCurrencySymbol(watchedCurrency);
  const currencyOptions = Array.from<string>(
    new Set(['USD', 'EUR', 'GBP', listing.currency].filter(Boolean)),
  );

  const handleFormSubmit = async (values: BidFormOutput) => {
    setServerError(null);
    const amountCents = Math.round(values.amount * 100);
    const payload: BidCreateInput = {
      amountCents,
      currency: values.currency || listing.currency || 'USD',
      deliveryDays: values.deliveryDays,
      message: values.message,
      ...(isEditing && !attachmentsTouched
        ? initialBid?.attachments !== undefined
          ? { attachmentIds: initialBid.attachments.map((a) => a.id) }
          : {}
        : { attachmentIds: attachments.map((att) => att.id) }),
    };

    try {
      await onSubmit(payload);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setServerError('This bid changed or the listing is no longer open. Please refresh.');
        if (onCancel) {
          onCancel();
        }
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to submit bid';
        setServerError(msg);
      }
    }
  };

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(handleFormSubmit)(e);
      }}
      className="space-y-6"
      noValidate
      aria-label={isEditing ? 'Edit bid form' : 'Place a bid form'}
    >
      {/* Listing context: price expectation & delivery */}
      <div className="rounded-md border border-border bg-muted/40 p-4 space-y-2">
        <p className="text-xs uppercase font-semibold text-muted-foreground tracking-wider">
          Listing Expectation
        </p>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <PriceTag
            priceType={listing.priceType}
            priceMinCents={listing.priceMinCents}
            priceMaxCents={listing.priceMaxCents}
            currency={listing.currency}
            size="sm"
          />
          {listing.deliveryDays ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>
                Estimated: {listing.deliveryDays} {listing.deliveryDays === 1 ? 'day' : 'days'}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {serverError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{serverError}</span>
        </div>
      )}

      {/* Amount, Currency, and Delivery days */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FormField id="bid-amount" label="Your Bid Amount" error={errors.amount?.message} required>
          {({ id: fieldId }) => (
            <div className="relative">
              <span
                className="absolute left-3 top-2.5 text-sm text-muted-foreground pointer-events-none select-none font-medium"
                aria-hidden="true"
              >
                {currencySymbol}
              </span>
              <Input
                id={fieldId}
                type="number"
                step="0.01"
                min="0.01"
                max="21474836.47"
                placeholder="0.00"
                className="pl-8"
                error={Boolean(errors.amount)}
                {...register('amount')}
              />
            </div>
          )}
        </FormField>

        <FormField id="bid-currency" label="Currency" error={errors.currency?.message}>
          <Controller
            name="currency"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="bid-currency" aria-label="Select currency">
                  <SelectValue placeholder={listing.currency || 'USD'} />
                </SelectTrigger>
                <SelectContent>
                  {currencyOptions.map((cur) => (
                    <SelectItem key={cur} value={cur}>
                      {cur} ({getCurrencySymbol(cur)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>

        <FormField
          id="bid-delivery-days"
          label="Delivery Timeline (days)"
          error={errors.deliveryDays?.message}
          required
        >
          <Input
            id="bid-delivery-days"
            type="number"
            min="1"
            max="3650"
            step="1"
            placeholder="e.g. 7"
            error={Boolean(errors.deliveryDays)}
            {...register('deliveryDays')}
          />
        </FormField>
      </div>

      {/* Proposal Message with character counter */}
      <FormField
        id="bid-message"
        label="Proposal / Message"
        error={errors.message?.message}
        hint="Detail your proposal, deliverables, and terms (max 5,000 characters)."
      >
        {({ id: fieldId }) => (
          <div className="space-y-1">
            <Textarea
              id={fieldId}
              rows={5}
              maxLength={5000}
              placeholder="Introduce your relevant experience, approach, milestones, or any questions..."
              error={Boolean(errors.message)}
              {...register('message')}
            />
            <div className="flex justify-end text-xs text-muted-foreground">
              <span
                aria-live="polite"
                className={messageLength > 5000 ? 'text-destructive font-medium' : ''}
              >
                {messageLength.toLocaleString()} / 5,000
              </span>
            </div>
          </div>
        )}
      </FormField>

      {/* Attachments via FileDropzone */}
      <div className="space-y-2">
        <span className="text-sm font-medium text-foreground block">Supporting Attachments</span>
        <FileDropzone
          purpose="BID_ATTACHMENT"
          value={attachments}
          onChange={(newFiles) => {
            setAttachments(newFiles);
            setAttachmentsTouched(true);
          }}
          onUploadStateChange={({ inFlightCount }) => setInFlightUploads(inFlightCount)}
          maxFiles={5}
          description="PDF, text, or zip archives up to 25MB each."
        />
      </div>

      {/* Form Action Buttons */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isLoading || inFlightUploads > 0}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" isLoading={isLoading} disabled={isLoading || inFlightUploads > 0}>
          {inFlightUploads > 0 ? 'Uploading files...' : isEditing ? 'Update Bid' : 'Submit Bid'}
        </Button>
      </div>
    </form>
  );
}
