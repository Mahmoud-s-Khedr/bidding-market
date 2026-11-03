import * as React from 'react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import type { PriceType } from '@/lib/api/types';

export interface PriceTagProps {
  priceType: PriceType;
  priceMinCents?: number | null;
  priceMaxCents?: number | null;
  currency?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function PriceTag({
  priceType,
  priceMinCents,
  priceMaxCents,
  currency = 'USD',
  size = 'md',
  className,
}: PriceTagProps) {
  const sizeClasses = {
    sm: 'text-sm font-semibold',
    md: 'text-base font-bold',
    lg: 'text-xl md:text-2xl font-extrabold',
  };

  let formatted = '';

  if (priceType === 'FIXED') {
    const cents = priceMinCents ?? priceMaxCents;
    formatted = typeof cents === 'number' ? formatMoney(cents, currency) : 'Fixed';
  } else if (priceType === 'RANGE') {
    if (
      priceMinCents !== undefined &&
      priceMinCents !== null &&
      priceMaxCents !== undefined &&
      priceMaxCents !== null
    ) {
      formatted = `${formatMoney(priceMinCents, currency)} – ${formatMoney(priceMaxCents, currency)}`;
    } else if (priceMinCents !== undefined && priceMinCents !== null) {
      formatted = `From ${formatMoney(priceMinCents, currency)}`;
    } else if (priceMaxCents !== undefined && priceMaxCents !== null) {
      formatted = `Up to ${formatMoney(priceMaxCents, currency)}`;
    } else {
      formatted = 'Price range';
    }
  } else {
    formatted = 'Negotiable';
  }

  return (
    <span className={cn('text-foreground tracking-tight', sizeClasses[size], className)}>
      {formatted}
    </span>
  );
}
