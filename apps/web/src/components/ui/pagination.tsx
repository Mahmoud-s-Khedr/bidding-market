import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export interface PaginationProps extends React.HTMLAttributes<HTMLElement> {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  disabled,
  className,
  ...props
}: PaginationProps) {
  const canGoPrevious = page > 1;
  const canGoNext = page < totalPages;

  return (
    <nav
      role="navigation"
      aria-label="Pagination"
      className={cn('flex items-center justify-center gap-2', className)}
      {...props}
    >
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page - 1)}
        disabled={!canGoPrevious || disabled}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        Previous
      </Button>

      <span className="text-sm font-medium text-muted-foreground px-2">
        Page <span className="text-foreground">{page}</span> of{' '}
        <span className="text-foreground">{Math.max(totalPages, 1)}</span>
      </span>

      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page + 1)}
        disabled={!canGoNext || disabled}
        aria-label="Next page"
      >
        Next
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </nav>
  );
}

export interface LoadMoreProps extends React.HTMLAttributes<HTMLDivElement> {
  onLoadMore: () => void;
  hasMore: boolean;
  isLoading?: boolean;
  label?: string;
}

export function LoadMore({
  onLoadMore,
  hasMore,
  isLoading = false,
  label = 'Load more',
  className,
  ...props
}: LoadMoreProps) {
  if (!hasMore) {
    return null;
  }

  return (
    <div className={cn('flex items-center justify-center py-4', className)} {...props}>
      <Button variant="outline" onClick={onLoadMore} isLoading={isLoading} disabled={isLoading}>
        {label}
      </Button>
    </div>
  );
}
