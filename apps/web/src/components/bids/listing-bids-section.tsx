'use client';

import * as React from 'react';
import Link from 'next/link';
import { ExternalLink, Gavel } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RatingStars } from '@/components/shared/rating-stars';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { BidStatusBadge } from '@/components/bids/bid-status-badge';
import { BidActionBar } from '@/components/bids/bid-action-bar';
import { useBidActions } from '@/components/bids/use-bid-actions';
import { CounterDialog } from '@/components/bids/counter-dialog';
import { RejectDialog } from '@/components/bids/reject-dialog';
import { useListingBids } from '@/lib/api/bids';
import { formatDate, formatMoney } from '@/lib/format';
import type { BidSort, ListingDetail } from '@/lib/api/types';

export interface ListingBidsSectionProps {
  listing: ListingDetail;
}

export function ListingBidsSection({ listing }: ListingBidsSectionProps) {
  const [sort, setSort] = React.useState<BidSort>('newest');

  // Queries
  const {
    data,
    isLoading,
    isError,
    error,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useListingBids(listing.id, sort);

  const {
    selectedBid: selectedBidForAction,
    rejectDialogOpen,
    setRejectDialogOpen,
    counterDialogOpen,
    setCounterDialogOpen,
    acceptDialogOpen,
    setAcceptDialogOpen,
    openCounter,
    openReject,
    openAccept,
    handleShortlist,
    handleConfirmReject,
    handleConfirmCounter,
    handleConfirmAccept,
    isShortlisting,
    isRejecting,
    isCountering,
    isAccepting,
  } = useBidActions({ refetch });

  const allBids = React.useMemo(() => {
    return data?.pages.flatMap((page) => page.items) ?? [];
  }, [data]);

  return (
    <section
      aria-labelledby="bids-section-title"
      className="mt-12 rounded-lg border border-border bg-card p-6 shadow-xs space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 id="bids-section-title" className="text-xl font-bold text-foreground">
            Bids ({listing.bidCount ?? allBids.length})
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Compare proposals, negotiate counter-offers, or accept the best candidate.
          </p>
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            Sort by:
          </span>
          <Select
            value={sort}
            onValueChange={(val) => setSort(val as BidSort)}
            aria-label="Sort bids"
          >
            <SelectTrigger className="w-[180px] h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="amount_asc">Lowest amount</SelectItem>
              <SelectItem value="amount_desc">Highest amount</SelectItem>
              <SelectItem value="delivery">Fastest delivery</SelectItem>
              <SelectItem value="rating">Highest rating</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading proposals...</div>
      ) : isError ? (
        <ErrorState
          title="Failed to load bids"
          message={
            error instanceof Error
              ? error.message
              : 'Could not load bids for this listing. Please try again.'
          }
          onRetry={() => void refetch()}
        />
      ) : allBids.length === 0 ? (
        <EmptyState
          icon={Gavel}
          title="No bids received yet"
          description="When providers submit their proposals for this listing, they will appear here for comparison."
        />
      ) : (
        <div className="space-y-4">
          {/* Compare Table for Desktop */}
          <div className="hidden lg:block overflow-x-auto rounded-md border border-border">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-muted/50 text-xs uppercase font-medium text-muted-foreground border-b border-border">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Bidder
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Amount
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Delivery
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Submitted
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Proposal Excerpt
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {allBids.map((bid) => {
                  return (
                    <tr
                      key={bid.id}
                      className="hover:bg-muted/20 transition-colors"
                      data-testid={`bid-row-${bid.id}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Link href={`/users/${bid.bidder.id}`}>
                            <Avatar className="h-9 w-9">
                              <AvatarImage
                                src={bid.bidder.avatarUrl || undefined}
                                alt={bid.bidder.displayName}
                              />
                              <AvatarFallback>
                                {bid.bidder.displayName.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          </Link>
                          <div className="min-w-0">
                            <Link
                              href={`/users/${bid.bidder.id}`}
                              className="font-medium text-foreground hover:text-primary transition-colors block truncate"
                            >
                              {bid.bidder.displayName}
                            </Link>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {typeof bid.bidder.ratingAvg === 'number' && (
                                <RatingStars rating={bid.bidder.ratingAvg} size="sm" />
                              )}
                              <span>• {bid.bidder.completedCount ?? 0} done</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 font-semibold text-foreground whitespace-nowrap">
                        {formatMoney(bid.amountCents, bid.currency)}
                      </td>

                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {bid.deliveryDays} {bid.deliveryDays === 1 ? 'day' : 'days'}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <BidStatusBadge status={bid.status} />
                      </td>

                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(bid.createdAt)}
                      </td>

                      <td className="px-4 py-3 max-w-xs">
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {bid.message || 'No additional proposal message.'}
                        </p>
                        <Link
                          href={`/bids/${bid.id}`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                        >
                          View thread <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <BidActionBar
                          bid={bid}
                          listingIsOpen={listing.status === 'OPEN'}
                          isOwner={true}
                          onShortlist={handleShortlist}
                          onCounter={openCounter}
                          onReject={openReject}
                          onAccept={openAccept}
                          isShortlisting={isShortlisting}
                          layout="table"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Compare Cards for Mobile / Small Screens */}
          <div className="lg:hidden space-y-4">
            {allBids.map((bid) => {
              return (
                <div
                  key={bid.id}
                  className="rounded-lg border border-border bg-card p-4 space-y-3"
                  data-testid={`bid-card-${bid.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Link href={`/users/${bid.bidder.id}`}>
                        <Avatar className="h-10 w-10">
                          <AvatarImage
                            src={bid.bidder.avatarUrl || undefined}
                            alt={bid.bidder.displayName}
                          />
                          <AvatarFallback>
                            {bid.bidder.displayName.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </Link>
                      <div>
                        <Link
                          href={`/users/${bid.bidder.id}`}
                          className="font-medium text-foreground hover:text-primary transition-colors block"
                        >
                          {bid.bidder.displayName}
                        </Link>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {typeof bid.bidder.ratingAvg === 'number' && (
                            <RatingStars rating={bid.bidder.ratingAvg} size="sm" />
                          )}
                          <span>• {bid.bidder.completedCount ?? 0} completed</span>
                        </div>
                      </div>
                    </div>
                    <BidStatusBadge status={bid.status} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border">
                    <div>
                      <span className="text-muted-foreground">Amount: </span>
                      <strong className="text-foreground text-sm">
                        {formatMoney(bid.amountCents, bid.currency)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Delivery: </span>
                      <strong className="text-foreground">
                        {bid.deliveryDays} {bid.deliveryDays === 1 ? 'day' : 'days'}
                      </strong>
                    </div>
                  </div>

                  <p className="line-clamp-3 text-xs text-muted-foreground bg-muted/30 p-2.5 rounded-md">
                    {bid.message || 'No additional proposal message.'}
                  </p>

                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                    <span>Submitted {formatDate(bid.createdAt)}</span>
                    <Link
                      href={`/bids/${bid.id}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                    >
                      View thread <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>

                  {/* Actions Bar */}
                  <BidActionBar
                    bid={bid}
                    listingIsOpen={listing.status === 'OPEN'}
                    isOwner={true}
                    onShortlist={handleShortlist}
                    onCounter={openCounter}
                    onReject={openReject}
                    onAccept={openAccept}
                    isShortlisting={isShortlisting}
                    layout="grid"
                  />
                </div>
              );
            })}
          </div>

          {/* Infinite Load More */}
          {hasNextPage && (
            <div className="pt-4 text-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchNextPage()}
                isLoading={isFetchingNextPage}
              >
                Load more proposals
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Reject Dialog */}
      <RejectDialog
        open={rejectDialogOpen}
        onOpenChange={setRejectDialogOpen}
        onConfirm={handleConfirmReject}
        isLoading={isRejecting}
      />

      {/* Counter Dialog */}
      <CounterDialog
        open={counterDialogOpen}
        onOpenChange={setCounterDialogOpen}
        bid={selectedBidForAction}
        onConfirm={handleConfirmCounter}
        isLoading={isCountering}
      />

      {/* Accept Confirmation Dialog */}
      <ConfirmDialog
        open={acceptDialogOpen}
        onOpenChange={setAcceptDialogOpen}
        title="Accept Proposal & Create Agreement"
        description="Are you sure you want to accept this bid? All other active proposals for this listing will be declined and a formal project agreement will be created."
        confirmText="Accept Proposal"
        variant="primary"
        isLoading={isAccepting}
        onConfirm={handleConfirmAccept}
      />
    </section>
  );
}
