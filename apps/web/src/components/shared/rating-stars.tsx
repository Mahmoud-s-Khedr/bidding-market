import * as React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RatingStarsProps {
  rating?: number | null;
  count?: number;
  size?: 'sm' | 'md' | 'lg';
  showCount?: boolean;
  className?: string;
}

export function RatingStars({
  rating = 0,
  count,
  size = 'md',
  showCount = true,
  className,
}: RatingStarsProps) {
  const safeRating = typeof rating === 'number' && !Number.isNaN(rating) ? rating : 0;
  const clampedRating = Math.min(5, Math.max(0, safeRating));
  const roundedRating = Math.round(clampedRating * 10) / 10;

  const sizeClasses = {
    sm: 'h-3.5 w-3.5',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  const accessibleLabel = `${roundedRating.toFixed(1)} out of 5`;

  return (
    <div
      className={cn('inline-flex items-center gap-1.5', className)}
      role="img"
      aria-label={accessibleLabel}
    >
      <div className="flex items-center gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((starIndex) => {
          const isFull = clampedRating >= starIndex;
          const isHalf = !isFull && clampedRating >= starIndex - 0.5;

          return (
            <div key={starIndex} className="relative inline-block">
              {/* Background empty star */}
              <Star
                className={cn(
                  sizeClasses[size],
                  'text-muted-foreground/30 fill-muted-foreground/20 stroke-muted-foreground/40',
                )}
              />

              {/* Foreground filled or half star */}
              {(isFull || isHalf) && (
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: isHalf ? '50%' : '100%' }}
                >
                  <Star
                    className={cn(
                      sizeClasses[size],
                      'text-amber-500 fill-amber-400 stroke-amber-500',
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <span className="text-xs font-medium text-foreground ml-0.5">{roundedRating.toFixed(1)}</span>

      {showCount && typeof count === 'number' && (
        <span className="text-xs text-muted-foreground">({count})</span>
      )}
    </div>
  );
}
