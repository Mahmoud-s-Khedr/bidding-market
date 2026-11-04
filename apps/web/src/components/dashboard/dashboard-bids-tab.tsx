import * as React from 'react';
import Link from 'next/link';
import { Gavel, ArrowRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { formatMoney, formatDate } from '@/lib/format';
import { useInfiniteMyBids } from '@/lib/api/bids';
import { useAuth } from '@/components/auth/auth-provider';
import type { BidStatus, BidWithListing } from '@market/shared';

const STATUS_FILTERS: Array<{ label: string; value: string }> = [
  { label: 'All Bids', value: 'ALL' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Shortlisted', value: 'SHORTLISTED' },
  { label: 'Countered', value: 'COUNTERED' },
  { label: 'Accepted', value: 'ACCEPTED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Withdrawn', value: 'WITHDRAWN' },
];

export function DashboardBidsTab() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');

  const queryParams = React.useMemo(() => {
    if (statusFilter === 'ALL') return undefined;
    return { status: statusFilter as BidStatus };
  }, [statusFilter]);

  const { data, isLoading, error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteMyBids(queryParams, { viewerId: user?.id });

  const bids: BidWithListing[] = React.useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.items);
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">My Bids ({bids.length})</h2>

        {/* Filter buttons */}
        <div
          className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0"
          role="group"
          aria-label="Filter bids by status"
        >
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f.value}
              type="button"
              variant={statusFilter === f.value ? 'primary' : 'outline'}
              size="sm"
              className="text-xs h-7 px-2.5 rounded-full"
              aria-pressed={statusFilter === f.value}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3" data-testid="bids-skeleton">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-4 flex items-center justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-4 w-1/4" />
              </div>
              <Skeleton className="h-8 w-24" />
            </Card>
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Failed to load your bids"
          message="Could not load your bids. Please try again."
          onRetry={() => {
            void refetch();
          }}
        />
      ) : bids.length === 0 ? (
        <EmptyState
          icon={Gavel}
          title="No bids found"
          description={
            statusFilter === 'ALL'
              ? 'You have not submitted any bids yet. Explore open requests and make your first offer.'
              : `No bids with status "${statusFilter}".`
          }
          action={
            <Button asChild size="sm">
              <Link href="/listings">Browse listings</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {bids.map((item) => (
            <Card
              key={item.id}
              className="p-4 hover:border-border/80 transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge
                    variant={
                      item.status === 'ACCEPTED'
                        ? 'default'
                        : item.status === 'PENDING'
                          ? 'outline'
                          : item.status === 'COUNTERED'
                            ? 'secondary'
                            : 'destructive'
                    }
                    className="text-[10px] uppercase font-bold"
                  >
                    {item.status}
                  </Badge>
                  {item.listing?.categoryName && (
                    <span className="text-xs text-muted-foreground">
                      {item.listing.categoryName}
                    </span>
                  )}
                </div>

                <Link
                  href={`/listings/${item.listingId}`}
                  className="font-medium text-foreground hover:text-primary transition-colors text-base line-clamp-1 block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs"
                >
                  {item.listing?.title ?? 'Listing'}
                </Link>

                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                  <span className="font-semibold text-foreground text-sm">
                    {formatMoney(item.amountCents, item.currency)}
                  </span>
                  <span>•</span>
                  <span>Delivery: {item.deliveryDays} days</span>
                  <span>•</span>
                  <span>Submitted {formatDate(item.createdAt)}</span>
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/listings/${item.listingId}`}>
                    Listing <ArrowRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void fetchNextPage();
            }}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Loading more...
              </>
            ) : (
              'Load more bids'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
