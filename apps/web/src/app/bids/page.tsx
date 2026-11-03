'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Clock, ExternalLink, Gavel, Inbox, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { RequireAuth } from '@/components/auth/require-auth';
import { BidStatusBadge } from '@/components/bids/bid-status-badge';
import { useMyBids } from '@/lib/api/bids';
import { formatDate, formatMoney } from '@/lib/format';
import type { BidWithListing } from '@/lib/api/types';

function MyBidsPageContent() {
  const [activeTab, setActiveTab] = React.useState<'active' | 'accepted' | 'closed'>('active');

  // Query per status group so pagination does not cause cross-tab starvation
  const pendingQuery = useMyBids('PENDING');
  const shortlistedQuery = useMyBids('SHORTLISTED');
  const counteredQuery = useMyBids('COUNTERED');

  const acceptedQuery = useMyBids('ACCEPTED');

  const rejectedQuery = useMyBids('REJECTED');
  const withdrawnQuery = useMyBids('WITHDRAWN');
  const declinedQuery = useMyBids('DECLINED');

  const activeBids = React.useMemo(() => {
    const p = pendingQuery.data?.pages.flatMap((page) => page.items) ?? [];
    const s = shortlistedQuery.data?.pages.flatMap((page) => page.items) ?? [];
    const c = counteredQuery.data?.pages.flatMap((page) => page.items) ?? [];
    return [...p, ...s, ...c].sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt).getTime() -
        new Date(a.updatedAt || a.createdAt).getTime(),
    );
  }, [pendingQuery.data, shortlistedQuery.data, counteredQuery.data]);

  const acceptedBids = React.useMemo(() => {
    const a = acceptedQuery.data?.pages.flatMap((page) => page.items) ?? [];
    return [...a].sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt).getTime() -
        new Date(a.updatedAt || a.createdAt).getTime(),
    );
  }, [acceptedQuery.data]);

  const closedBids = React.useMemo(() => {
    const r = rejectedQuery.data?.pages.flatMap((page) => page.items) ?? [];
    const w = withdrawnQuery.data?.pages.flatMap((page) => page.items) ?? [];
    const d = declinedQuery.data?.pages.flatMap((page) => page.items) ?? [];
    return [...r, ...w, ...d].sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt).getTime() -
        new Date(a.updatedAt || a.createdAt).getTime(),
    );
  }, [rejectedQuery.data, withdrawnQuery.data, declinedQuery.data]);

  const isActiveLoading =
    pendingQuery.isLoading || shortlistedQuery.isLoading || counteredQuery.isLoading;
  const isAcceptedLoading = acceptedQuery.isLoading;
  const isClosedLoading =
    rejectedQuery.isLoading || withdrawnQuery.isLoading || declinedQuery.isLoading;

  const activeHasNextPage =
    pendingQuery.hasNextPage || shortlistedQuery.hasNextPage || counteredQuery.hasNextPage;
  const isActiveFetchingNext =
    pendingQuery.isFetchingNextPage ||
    shortlistedQuery.isFetchingNextPage ||
    counteredQuery.isFetchingNextPage;
  const handleFetchNextActive = () => {
    if (pendingQuery.hasNextPage) void pendingQuery.fetchNextPage();
    if (shortlistedQuery.hasNextPage) void shortlistedQuery.fetchNextPage();
    if (counteredQuery.hasNextPage) void counteredQuery.fetchNextPage();
  };

  const acceptedHasNextPage = acceptedQuery.hasNextPage;
  const isAcceptedFetchingNext = acceptedQuery.isFetchingNextPage;
  const handleFetchNextAccepted = () => {
    if (acceptedQuery.hasNextPage) void acceptedQuery.fetchNextPage();
  };

  const closedHasNextPage =
    rejectedQuery.hasNextPage || withdrawnQuery.hasNextPage || declinedQuery.hasNextPage;
  const isClosedFetchingNext =
    rejectedQuery.isFetchingNextPage ||
    withdrawnQuery.isFetchingNextPage ||
    declinedQuery.isFetchingNextPage;
  const handleFetchNextClosed = () => {
    if (rejectedQuery.hasNextPage) void rejectedQuery.fetchNextPage();
    if (withdrawnQuery.hasNextPage) void withdrawnQuery.fetchNextPage();
    if (declinedQuery.hasNextPage) void declinedQuery.fetchNextPage();
  };

  const renderBidRow = (bid: BidWithListing) => {
    const listing = bid.listing;

    return (
      <div
        key={bid.id}
        data-testid={`my-bid-row-${bid.id}`}
        className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-xs"
      >
        {/* Left: Listing thumbnail & details */}
        <div className="flex items-start gap-4 min-w-0 flex-1">
          {/* Thumbnail */}
          <Link
            href={`/listings/${bid.listingId}`}
            className="relative h-16 w-20 shrink-0 overflow-hidden rounded-md bg-muted/40 border border-border"
          >
            {listing?.thumbnailUrl ? (
              <img
                src={listing.thumbnailUrl}
                alt=""
                className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                <Tag className="h-6 w-6" />
              </div>
            )}
          </Link>

          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[11px] font-normal">
                {listing?.categoryName || 'General'}
              </Badge>
              {listing?.kind && (
                <Badge
                  variant={listing.kind === 'REQUEST' ? 'default' : 'secondary'}
                  className="text-[10px]"
                >
                  {listing.kind}
                </Badge>
              )}
            </div>

            <Link
              href={`/listings/${bid.listingId}`}
              className="text-base font-semibold text-foreground hover:text-primary transition-colors line-clamp-1 block"
            >
              {listing?.title || 'Listing'}
            </Link>

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Updated {formatDate(bid.updatedAt || bid.createdAt)}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {bid.deliveryDays} {bid.deliveryDays === 1 ? 'day' : 'days'} delivery
              </span>
            </div>
          </div>
        </div>

        {/* Right: My amount, status badge & action buttons */}
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between md:justify-end gap-4 w-full md:w-auto pt-3 md:pt-0 border-t md:border-t-0 border-border">
          <div className="text-left md:text-right">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold block">
              My Proposal
            </span>
            <span className="text-lg font-bold text-foreground">
              {formatMoney(bid.amountCents, bid.currency)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <BidStatusBadge status={bid.status} />

            <Button asChild size="sm" variant="outline">
              <Link href={`/bids/${bid.id}`}>View Proposal</Link>
            </Button>

            <Button asChild size="sm" variant="ghost">
              <Link href={`/listings/${bid.listingId}`} title="View listing">
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <RequireAuth>
      <div className="container mx-auto px-4 py-8 sm:px-6 max-w-5xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">My Bids</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track all your active proposals, accepted agreements, and past negotiations.
          </p>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as 'active' | 'accepted' | 'closed')}
          className="space-y-6"
        >
          <TabsList className="grid grid-cols-3 max-w-md">
            <TabsTrigger value="active" data-testid="tab-active">
              Active ({activeBids.length})
            </TabsTrigger>
            <TabsTrigger value="accepted" data-testid="tab-accepted">
              Accepted ({acceptedBids.length})
            </TabsTrigger>
            <TabsTrigger value="closed" data-testid="tab-closed">
              Closed ({closedBids.length})
            </TabsTrigger>
          </TabsList>

          {/* Active Tab */}
          <TabsContent value="active" className="space-y-4">
            {isActiveLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            ) : activeBids.length === 0 ? (
              <EmptyState
                icon={Gavel}
                title="No active bids"
                description="You do not have any pending or countered proposals. Find exciting opportunities on the browse page."
                action={
                  <Button asChild>
                    <Link href="/listings">
                      Browse Opportunities <ArrowRight className="h-4 w-4 ml-1.5" />
                    </Link>
                  </Button>
                }
              />
            ) : (
              <>
                <div className="space-y-3">{activeBids.map(renderBidRow)}</div>
                {activeHasNextPage && (
                  <div className="text-center pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleFetchNextActive}
                      isLoading={isActiveFetchingNext}
                    >
                      Load more bids
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Accepted Tab */}
          <TabsContent value="accepted" className="space-y-4">
            {isAcceptedLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            ) : acceptedBids.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No accepted bids yet"
                description="When an owner accepts your proposal or you accept their counter-offer, it will be listed here."
              />
            ) : (
              <>
                <div className="space-y-3">{acceptedBids.map(renderBidRow)}</div>
                {acceptedHasNextPage && (
                  <div className="text-center pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleFetchNextAccepted}
                      isLoading={isAcceptedFetchingNext}
                    >
                      Load more bids
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Closed Tab */}
          <TabsContent value="closed" className="space-y-4">
            {isClosedLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            ) : closedBids.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No closed bids"
                description="Rejected, withdrawn, or declined proposals will be archived here."
              />
            ) : (
              <>
                <div className="space-y-3">{closedBids.map(renderBidRow)}</div>
                {closedHasNextPage && (
                  <div className="text-center pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleFetchNextClosed}
                      isLoading={isClosedFetchingNext}
                    >
                      Load more bids
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </RequireAuth>
  );
}

export default function MyBidsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex justify-center p-12">
          <Spinner size="lg" label="Loading..." />
        </div>
      }
    >
      <MyBidsPageContent />
    </React.Suspense>
  );
}
