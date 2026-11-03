import * as React from 'react';
import Link from 'next/link';
import { PlusCircle, FileText, ArrowRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { formatMoney, formatDate } from '@/lib/format';
import { useListings } from '@/lib/api/listings';
import { useAuth } from '@/components/auth/auth-provider';
import type { ListingSummary } from '@/lib/api/types';

export function DashboardListingsTab() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useListings(user?.id ? { ownerId: user.id } : undefined);

  const listings: ListingSummary[] = React.useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.items);
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="listings-skeleton">
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
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to load your listings"
        message="Could not load your listings. Please try again."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (listings.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No listings yet"
        description="You have not published any requests or offers yet."
        action={
          <Button asChild size="sm">
            <Link href="/listings/new">
              <PlusCircle className="h-4 w-4 mr-2" />
              Post a request/offer
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">My Listings ({listings.length})</h2>
        <Button asChild size="sm" variant="outline">
          <Link href="/listings/new">
            <PlusCircle className="h-4 w-4 mr-1.5" />
            Create New
          </Link>
        </Button>
      </div>

      <div className="space-y-3">
        {listings.map((item) => (
          <Card
            key={item.id}
            className="p-4 hover:border-border/80 transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Badge
                  variant={item.kind === 'REQUEST' ? 'default' : 'secondary'}
                  className="text-[10px] uppercase font-bold"
                >
                  {item.kind}
                </Badge>
                <Badge
                  variant={
                    item.status === 'OPEN'
                      ? 'outline'
                      : item.status === 'IN_PROGRESS'
                        ? 'secondary'
                        : item.status === 'COMPLETED'
                          ? 'default'
                          : 'destructive'
                  }
                  className="text-[10px]"
                >
                  {item.status.replace('_', ' ')}
                </Badge>
                <span className="text-xs text-muted-foreground">{item.categoryName}</span>
              </div>

              <Link
                href={`/listings/${item.id}`}
                className="font-medium text-foreground hover:text-primary transition-colors text-base line-clamp-1 block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs"
              >
                {item.title}
              </Link>

              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                <span className="font-semibold text-foreground">
                  {item.priceMinCents !== null && item.priceMinCents !== undefined
                    ? formatMoney(item.priceMinCents, item.currency)
                    : 'Negotiable'}
                  {item.priceMaxCents ? ` – ${formatMoney(item.priceMaxCents, item.currency)}` : ''}
                </span>
                <span>•</span>
                <span>
                  {item.bidCount} bid{item.bidCount === 1 ? '' : 's'}
                </span>
                <span>•</span>
                <span>Created {formatDate(item.createdAt)}</span>
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2">
              <Button asChild size="sm" variant="ghost">
                <Link href={`/listings/${item.id}`}>
                  View <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </div>
          </Card>
        ))}
      </div>

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
              'Load more listings'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
