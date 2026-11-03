'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Calendar,
  Clock,
  Download,
  Edit3,
  FileText,
  MapPin,
  MessageSquare,
  PackageSearch,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ImageGallery } from '@/components/shared/image-gallery';
import { PriceTag } from '@/components/shared/price-tag';
import { RatingStars } from '@/components/shared/rating-stars';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { BidForm } from '@/components/bids/bid-form';
import { BidStatusBadge } from '@/components/bids/bid-status-badge';
import { ListingBidsSection } from '@/components/bids/listing-bids-section';
import { useAuth } from '@/components/auth/auth-provider';
import { useToast } from '@/components/ui/toast';
import { useCloseListing, useDeleteListing, useListing } from '@/lib/api/listings';
import { useBid, useCreateBid, useUpdateBid, useWithdrawBid } from '@/lib/api/bids';
import { getAttachmentUrl } from '@/lib/api/uploads';
import { formatDate, formatMoney } from '@/lib/format';
import { ApiError } from '@/lib/api/client';
import type { Attachment, BidCreateInput } from '@/lib/api/types';

export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = (params?.id as string) || '';

  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const {
    data: listing,
    isLoading: isListingLoading,
    isError,
    error,
    refetch,
  } = useListing(id, {
    enabled: Boolean(id) && !authLoading,
    viewerId: user?.id ?? null,
  });

  const isLoading = authLoading || (isListingLoading && !listing);

  const closeMutation = useCloseListing();
  const deleteMutation = useDeleteListing();
  const createBidMutation = useCreateBid();
  const updateBidMutation = useUpdateBid();
  const withdrawBidMutation = useWithdrawBid();

  const hasActiveBid = Boolean(
    listing?.myBid &&
    (listing.myBid.status === 'PENDING' ||
      listing.myBid.status === 'SHORTLISTED' ||
      listing.myBid.status === 'COUNTERED'),
  );

  const myBidId = hasActiveBid ? (listing?.myBid?.id ?? '') : '';
  const { data: myBidDetail, isLoading: isLoadingMyBid } = useBid(myBidId, {
    enabled: Boolean(myBidId),
  });

  const [closeDialogOpen, setCloseDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [placeholderDialogOpen, setPlaceholderDialogOpen] = React.useState<string | null>(null);
  const [bidDialogOpen, setBidDialogOpen] = React.useState(false);
  const [isEditingBid, setIsEditingBid] = React.useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = React.useState(false);

  const isOwner = Boolean(user && listing && user.id === listing.owner.id);

  const handleDownloadAttachment = async (attachment: Attachment) => {
    try {
      const res = await getAttachmentUrl(attachment.id);
      window.open(res.url, '_blank', 'noopener,noreferrer');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to retrieve download URL';
      toast({
        title: 'Download failed',
        description: msg,
        variant: 'error',
      });
    }
  };

  const handleCloseListing = async () => {
    try {
      await closeMutation.mutateAsync(id);
      setCloseDialogOpen(false);
      toast({
        title: 'Listing closed',
        description: 'Your listing has been closed and pending bids declined.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to close listing';
      toast({
        title: 'Action failed',
        description: msg,
        variant: 'error',
      });
    }
  };

  const handleDeleteListing = async () => {
    try {
      await deleteMutation.mutateAsync(id);
      setDeleteDialogOpen(false);
      toast({
        title: 'Listing deleted',
        description: 'Your listing has been permanently removed.',
      });
      router.push('/listings');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete listing';
      toast({
        title: 'Action failed',
        description: msg,
        variant: 'error',
      });
    }
  };

  const handleOpenBidDialog = () => {
    if (!user) {
      router.push(`/login?next=/listings/${encodeURIComponent(id)}`);
      return;
    }
    setIsEditingBid(false);
    setBidDialogOpen(true);
  };

  const handleOpenEditBidDialog = () => {
    setIsEditingBid(true);
    setBidDialogOpen(true);
  };

  const handleBidSubmit = async (payload: BidCreateInput) => {
    try {
      if (isEditingBid && listing?.myBid && hasActiveBid) {
        await updateBidMutation.mutateAsync({
          id: listing.myBid.id,
          data: payload,
        });
        setBidDialogOpen(false);
        toast({
          title: 'Bid updated',
          description: 'Your proposal has been updated successfully.',
        });
      } else {
        await createBidMutation.mutateAsync({
          listingId: id,
          data: payload,
        });
        setBidDialogOpen(false);
        toast({
          title: 'Bid placed',
          description: 'Your proposal was submitted to the listing owner.',
        });
      }
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setBidDialogOpen(false);
        toast({
          title: 'Action Conflict',
          description: 'This bid changed or the listing is no longer open. Refreshing...',
          variant: 'error',
        });
        await refetch();
      }
      throw err;
    }
  };

  const handleConfirmWithdraw = async () => {
    if (!listing?.myBid) return;
    try {
      await withdrawBidMutation.mutateAsync(listing.myBid.id);
      setWithdrawDialogOpen(false);
      toast({
        title: 'Bid withdrawn',
        description: 'Your proposal has been withdrawn.',
      });
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setWithdrawDialogOpen(false);
        toast({
          title: 'Action Conflict',
          description: 'This bid changed or was already closed. Refreshing...',
          variant: 'error',
        });
        await refetch();
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to withdraw bid';
        toast({
          title: 'Action failed',
          description: msg,
          variant: 'error',
        });
      }
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 sm:px-6 max-w-5xl space-y-8">
        <Skeleton className="h-8 w-1/3" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="aspect-video w-full rounded-lg" />
            <Skeleton className="h-24 w-full" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  // 404 / NOT_FOUND / DRAFT forbidden handling
  if (
    (isError && error instanceof ApiError && (error.status === 404 || error.status === 403)) ||
    (!listing && !isLoading)
  ) {
    return (
      <div className="container mx-auto px-4 py-16 sm:px-6 max-w-2xl text-center">
        <EmptyState
          icon={PackageSearch}
          title="Listing Not Found"
          description="The listing you are looking for does not exist, has been removed, or is a private draft."
          action={
            <Button asChild>
              <Link href="/listings">Browse Marketplace</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container mx-auto px-4 py-16 sm:px-6 max-w-2xl">
        <ErrorState
          title="Unable to load listing"
          message={error instanceof Error ? error.message : 'Unexpected error loading listing'}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  if (!listing) return null;

  const isRequest = listing.kind === 'REQUEST';

  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 max-w-5xl space-y-8">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/listings" className="hover:text-foreground transition-colors">
            Listings
          </Link>
          {listing.category ? (
            <>
              <span>/</span>
              <Link
                href={`/categories/${listing.category.slug}`}
                className="hover:text-foreground transition-colors font-medium"
              >
                {listing.category.name}
              </Link>
            </>
          ) : null}
        </div>

        {/* Owner Action Buttons */}
        {isOwner ? (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {(listing.status === 'DRAFT' || listing.status === 'OPEN') && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/listings/${listing.id}/edit`}>
                  <Edit3 className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Link>
              </Button>
            )}

            {listing.status === 'OPEN' && (
              <Button variant="outline" size="sm" onClick={() => setCloseDialogOpen(true)}>
                <XCircle className="h-3.5 w-3.5 mr-1.5" />
                Close
              </Button>
            )}

            <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Main Content Area (Gallery + Description + Attachments) */}
        <div className="lg:col-span-2 space-y-8">
          {/* Gallery */}
          <ImageGallery images={listing.images} title={listing.title} />

          {/* Title & Badges */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={isRequest ? 'default' : 'secondary'}
                className="text-xs font-semibold uppercase tracking-wider px-2.5 py-0.5"
              >
                {isRequest ? 'Request' : 'Offer'}
              </Badge>

              <Badge variant="outline" className="text-xs font-medium">
                {listing.status}
              </Badge>

              <span className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                <MessageSquare className="h-3.5 w-3.5" />
                <span>
                  {listing.bidCount} {listing.bidCount === 1 ? 'bid' : 'bids'}
                </span>
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {listing.title}
            </h1>
          </div>

          {/* Description */}
          <div className="space-y-3 rounded-lg border border-border bg-card p-6">
            <h2 className="text-base font-semibold text-foreground">Overview & Details</h2>
            <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {listing.description}
            </div>
          </div>

          {/* Tags */}
          {listing.tags && listing.tags.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Tags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {listing.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs font-normal">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Attachments List */}
          {listing.attachments && listing.attachments.length > 0 && (
            <div className="space-y-3 rounded-lg border border-border bg-card p-6">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <span>Attachments & Documents ({listing.attachments.length})</span>
              </h3>

              <div className="space-y-2">
                {listing.attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between p-3 rounded-md border border-border bg-background text-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{att.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(att.sizeBytes)}
                        </p>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void handleDownloadAttachment(att);
                      }}
                      className="shrink-0"
                    >
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      Download
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: Price + Delivery + Owner Card + Actions */}
        <div className="space-y-6">
          {/* Price Card */}
          <div className="rounded-lg border border-border bg-card p-6 shadow-xs space-y-5">
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                {isRequest ? 'Target Budget' : 'Price'}
              </span>
              <div className="mt-1">
                <PriceTag
                  priceType={listing.priceType}
                  priceMinCents={listing.priceMinCents}
                  priceMaxCents={listing.priceMaxCents}
                  currency={listing.currency}
                  size="lg"
                />
              </div>
            </div>

            <div className="space-y-2.5 pt-4 border-t border-border text-xs text-muted-foreground">
              {listing.deliveryDays ? (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary shrink-0" />
                  <span>
                    Estimated delivery:{' '}
                    <strong className="text-foreground">
                      {listing.deliveryDays} {listing.deliveryDays === 1 ? 'day' : 'days'}
                    </strong>
                  </span>
                </div>
              ) : null}

              {listing.location ? (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary shrink-0" />
                  <span>
                    Location: <strong className="text-foreground">{listing.location}</strong>
                  </span>
                </div>
              ) : null}

              {listing.expiresAt ? (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary shrink-0" />
                  <span>
                    Expires:{' '}
                    <strong className="text-foreground">{formatDate(listing.expiresAt)}</strong>
                  </span>
                </div>
              ) : null}
            </div>

            {/* Non-owner CTA buttons */}
            {!isOwner && listing.status === 'OPEN' && (
              <div className="pt-4 border-t border-border">
                {hasActiveBid && listing.myBid ? (
                  <div className="space-y-3" data-testid="your-bid-section">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase font-semibold text-muted-foreground tracking-wider">
                        Your Bid
                      </span>
                      <BidStatusBadge status={listing.myBid.status} />
                    </div>

                    <div className="rounded-md border border-border bg-muted/40 p-3 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Amount:</span>
                        <span className="font-semibold text-foreground text-sm">
                          {formatMoney(listing.myBid.amountCents, listing.myBid.currency)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Delivery:</span>
                        <span className="text-foreground">
                          {listing.myBid.deliveryDays}{' '}
                          {listing.myBid.deliveryDays === 1 ? 'day' : 'days'}
                        </span>
                      </div>
                      {listing.myBid.message && (
                        <p className="line-clamp-2 text-muted-foreground italic pt-1 border-t border-border">
                          &ldquo;{listing.myBid.message}&rdquo;
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={handleOpenEditBidDialog}
                      >
                        <Edit3 className="h-3.5 w-3.5 mr-1" />
                        Edit Bid
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="flex-1"
                        onClick={() => setWithdrawDialogOpen(true)}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" />
                        Withdraw
                      </Button>
                    </div>

                    <Link
                      href={`/bids/${listing.myBid.id}`}
                      className="inline-flex items-center justify-center w-full text-xs text-primary hover:underline font-medium pt-1"
                    >
                      View negotiation thread
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <Button
                      size="lg"
                      className="w-full font-semibold"
                      onClick={handleOpenBidDialog}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Place a Bid
                    </Button>

                    {listing.myBid && (
                      <div className="text-center pt-1">
                        <Link
                          href={`/bids/${listing.myBid.id}`}
                          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                        >
                          <span>Previous bid ({listing.myBid.status.toLowerCase()}):</span>
                          <span className="text-primary hover:underline font-medium">
                            View thread
                          </span>
                        </Link>
                      </div>
                    )}

                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full"
                      onClick={() => setPlaceholderDialogOpen('message')}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Message Owner
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Owner Card */}
          <div className="rounded-lg border border-border bg-card p-6 shadow-xs space-y-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              Published By
            </div>

            <Link href={`/users/${listing.owner.id}`} className="group flex items-center gap-3">
              <Avatar className="h-12 w-12 border border-border">
                <AvatarImage
                  src={listing.owner.avatarUrl || undefined}
                  alt={listing.owner.displayName}
                />
                <AvatarFallback className="text-sm font-semibold">
                  {listing.owner.displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0">
                <p className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                  {listing.owner.displayName}
                </p>
                {listing.owner.isBusiness && listing.owner.companyName ? (
                  <p className="text-xs text-muted-foreground truncate">
                    {listing.owner.companyName}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Individual Member</p>
                )}
              </div>
            </Link>

            <div className="space-y-2 pt-3 border-t border-border text-xs">
              {typeof listing.owner.ratingAvg === 'number' && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Rating</span>
                  <RatingStars
                    rating={listing.owner.ratingAvg}
                    count={listing.owner.ratingCount}
                    size="sm"
                  />
                </div>
              )}

              {typeof listing.owner.completedCount === 'number' && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Completed Orders</span>
                  <span className="font-semibold text-foreground">
                    {listing.owner.completedCount}
                  </span>
                </div>
              )}

              {listing.owner.location && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Location</span>
                  <span className="text-foreground truncate max-w-[150px]">
                    {listing.owner.location}
                  </span>
                </div>
              )}
            </div>

            <Button variant="ghost" size="sm" className="w-full text-xs" asChild>
              <Link href={`/users/${listing.owner.id}`}>View full profile</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Owner View: Compare Table / Cards */}
      {isOwner && <ListingBidsSection listing={listing} />}

      {/* Owner Confirmation Dialogs */}
      <ConfirmDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        title="Close Listing"
        description="Are you sure you want to close this listing? This will decline any active pending bids and prevent new bids from being submitted."
        confirmText="Close Listing"
        variant="destructive"
        isLoading={closeMutation.isPending}
        onConfirm={handleCloseListing}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Listing"
        description="Are you sure you want to permanently delete this listing? Only draft listings or listings without accepted bids can be deleted."
        confirmText="Delete Permanently"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleDeleteListing}
      />

      {/* Bid Submission / Edit Dialog */}
      <Dialog open={bidDialogOpen} onOpenChange={setBidDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditingBid ? 'Edit Your Proposal' : 'Place a Bid'}</DialogTitle>
            <DialogDescription>
              {isEditingBid
                ? 'Update your bid amount, delivery timeline, or message. Submitting an edit resets the bid status to Pending.'
                : 'Propose your pricing and terms for this listing.'}
            </DialogDescription>
          </DialogHeader>

          {isEditingBid && hasActiveBid && isLoadingMyBid && !myBidDetail ? (
            <div className="py-8 space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <BidForm
              key={
                isEditingBid && hasActiveBid ? (myBidDetail?.id ?? listing.myBid?.id) : 'new-bid'
              }
              listing={listing}
              initialBid={isEditingBid && hasActiveBid ? (myBidDetail ?? listing.myBid) : null}
              onSubmit={handleBidSubmit}
              onCancel={() => setBidDialogOpen(false)}
              isLoading={createBidMutation.isPending || updateBidMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Bid Withdrawal Confirmation Dialog */}
      <ConfirmDialog
        open={withdrawDialogOpen}
        onOpenChange={setWithdrawDialogOpen}
        title="Withdraw Proposal"
        description="Are you sure you want to withdraw your bid? The owner will no longer be able to accept your proposal."
        confirmText="Withdraw Bid"
        variant="destructive"
        isLoading={withdrawBidMutation.isPending}
        onConfirm={handleConfirmWithdraw}
      />

      {/* Placeholder dialog for WEB-04 Messaging */}
      <ConfirmDialog
        open={Boolean(placeholderDialogOpen)}
        onOpenChange={(open) => !open && setPlaceholderDialogOpen(null)}
        title="Message Owner"
        description="Direct 1:1 real-time messaging and chat will be implemented in task WEB-04."
        confirmText="Got it"
        onConfirm={() => setPlaceholderDialogOpen(null)}
      />
    </div>
  );
}
