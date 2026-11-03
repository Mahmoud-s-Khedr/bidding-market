'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/ui/form-field';
import { getCurrencySymbol } from '@/lib/format';
import type { Bid, BidCounterInput } from '@/lib/api/types';

export const counterFormSchema = z.object({
  amount: z
    .union([z.number(), z.string()])
    .refine((v) => v !== '' && v !== undefined && v !== null && !Number.isNaN(Number(v)), {
      message: 'Please enter a valid counter amount',
    })
    .transform((v) => Number(v))
    .refine((v) => v > 0, { message: 'Amount must be greater than zero' })
    .refine((v) => v <= 21474836.47, { message: 'Amount cannot exceed 21,474,836.47' }),
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
  message: z
    .string()
    .trim()
    .min(1, 'Message is required')
    .max(5000, 'Message cannot exceed 5000 characters'),
});

type CounterFormValues = z.input<typeof counterFormSchema>;
type CounterFormOutput = z.output<typeof counterFormSchema>;

export interface CounterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bid: Bid | null;
  onConfirm: (payload: BidCounterInput) => Promise<void>;
  isLoading?: boolean;
}

export function CounterDialog({
  open,
  onOpenChange,
  bid,
  onConfirm,
  isLoading = false,
}: CounterDialogProps) {
  const currencySymbol = getCurrencySymbol(bid?.currency || 'USD');

  const form = useForm<CounterFormValues, unknown, CounterFormOutput>({
    resolver: zodResolver(counterFormSchema),
    values: {
      amount: bid ? bid.amountCents / 100 : '',
      deliveryDays: bid ? bid.deliveryDays : 7,
      message: '',
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = form;

  const handleFormSubmit = async (values: CounterFormOutput) => {
    const amountCents = Math.round(values.amount * 100);
    await onConfirm({
      amountCents,
      deliveryDays: values.deliveryDays,
      message: values.message,
    });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send Counter-Offer</DialogTitle>
          <DialogDescription>
            Propose a different amount, delivery timeline, and note for this bid. The bidder will be
            notified to accept or counter.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            void handleSubmit(handleFormSubmit)(e);
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              id="counter-amount"
              label="Counter Amount"
              error={errors.amount?.message}
              required
            >
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
                    className="pl-8"
                    error={Boolean(errors.amount)}
                    {...register('amount')}
                  />
                </div>
              )}
            </FormField>

            <FormField
              id="counter-delivery"
              label="Delivery (days)"
              error={errors.deliveryDays?.message}
              required
            >
              <Input
                id="counter-delivery"
                type="number"
                min="1"
                max="3650"
                step="1"
                error={Boolean(errors.deliveryDays)}
                {...register('deliveryDays')}
              />
            </FormField>
          </div>

          <FormField
            id="counter-message"
            label="Message to Bidder"
            error={errors.message?.message}
            required
            hint="Explain your counter-offer parameters."
          >
            <Textarea
              id="counter-message"
              rows={4}
              maxLength={5000}
              placeholder="e.g. We would like to proceed at this price point and timeline..."
              error={Boolean(errors.message)}
              {...register('message')}
            />
          </FormField>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={isLoading}>
              Send Counter-Offer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
