'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowUpDown,
  Check,
  Clock,
  ExternalLink,
  Gavel,
  History,
  MessageSquare,
  Sparkles,
  X,
  XCircle,
  Edit3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { RequireAuth } from '@/components/auth/require-auth';
import { useAuth } from '@/components/auth/auth-provider';
import { useToast } from '@/components/ui/toast';
import { BidStatusBadge } from '@/components/bids/bid-status-badge';
import { BidForm } from '@/components/bids/bid-form';
import { CounterDialog } from '@/components/bids/counter-dialog';
import { RejectDialog } from '@/components/bids/reject-dialog';
import {
  useAcceptBid,
  useAcceptCounter,
  useBid,
  useCounterBid,
  useRejectBid,
  useShortlistBid,
  useUpdateBid,
  useWithdrawBid,
} from '@/lib/api/bids';
import { canBidTransition } from '@/lib/api/bid-transitions';
import { formatDate, formatMoney } from '@/lib/format';
import { ApiError } from '@/lib/api/client';
import type { BidActorRole, BidCounterInput, BidCreateInput } from '@/lib/api/types';

function BidDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const id = (params?.id as string) || '';

  const { user } = useAuth();
  const { toast } = useToast();

  const {
    data: bid,
    isLoading,
    isError,
    error,
    refetch,
  } = useBid(id, {
    enabled: Boolean(id),
  });

  // Action Dialog states
  const [editDialogOpen, setEditDialogOpen] = React.useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = React.useState(false);
  const [counterDialogOpen, setCounterDialogOpen] = React.useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = React.useState(false);
  const [acceptBidDialogOpen, setAcceptBidDialogOpen] = React.useState(false);
  const [acceptCounterDialogOpen, setAcceptCounterDialogOpen] = React.useState(false);
  const [messagePlaceholderOpen, setMessagePlaceholderOpen] = React.useState(false);

  // Mutations
  const updateMutation = useUpdateBid();
  const withdrawMutation = useWithdrawBid();
  const shortlistMutation = useShortlistBid();
  const rejectMutation = useRejectBid();
  const counterMutation = useCounterBid();
  const acceptBidMutation = useAcceptBid();
  const acceptCounterMutation = useAcceptCounter();

  const actorRole: BidActorRole | null = React.useMemo(() => {
    if (!user || !bid) return null;
    if (user.id === bid.bidder.id) return 'bidder';
    if (bid.listing && user.id === bid.listing.owner?.id) return 'owner';
    return null;
  }, [user, bid]);

  const handleConflictError = async (err: unknown) => {
    if (err instanceof ApiError && err.status === 409) {
      setEditDialogOpen(false);
      setWithdrawDialogOpen(false);
      setRejectDialogOpen(false);
      setCounterDialogOpen(false);
      setAcceptBidDialogOpen(false);
      setAcceptCounterDialogOpen(false);
      toast({
        title: 'Action Conflict',
        description: 'This bid changed, refresh.',
        variant: 'error',
      });
      await refetch();
    } else {
      const msg = err instanceof Error ? err.message : 'Action failed';
      toast({
        title: 'Error',
        description: msg,
        variant: 'error',
      });
    }
  };

  const handleEditSubmit = async (payload: BidCreateInput) => {
    try {
      await updateMutation.mutateAsync({
        id,
        data: payload,
      });
      setEditDialogOpen(false);
      toast({
        title: 'Bid updated',
        description: 'Your proposal revisions have been submitted.',
      });
    } catch (err) {
      await handleConflictError(err);
    }
  };

  const handleWithdrawConfirm = async () => {
    try {
      await withdrawMutation.mutateAsync(id);
      setWithdrawDialogOpen(false);
      toast({
        title: 'Bid withdrawn',
        description: 'Your bid proposal has been withdrawn.',
      });
    } catch (err) {
      await handleConflictError(err);
    }
  };

  const handleShortlist = async () => {
    try {
      await shortlistMutation.mutateAsync(id);
      toast({
        title: 'Bid shortlisted',
        description: 'This proposal has been shortlisted.',
      });
    } catch (err) {
      await handleConflictError(err);
    }
  };

  const handleRejectConfirm = async (reason?: string) => {
    try {
      await rejectMutation.mutateAsync({
        id,
        data: { reason },
      });
      setRejectDialogOpen(false);
      toast({
        title: 'Bid rejected',
        description: 'This proposal was rejected.',
      });
    } catch (err) {
      await handleConflictError(err);
    }
  };

  const handleCounterConfirm = async (payload: BidCounterInput) => {
    try {
      await counterMutation.mutateAsync({
        id,
        data: payload,
      });
      setCounterDialogOpen(false);
      toast({
        title: 'Counter-offer sent',
        description: 'Your counter-offer was sent to the bidder.',
      });
    } catch (err) {
      await handleConflictError(err);
    }
  };

  const handleAcceptBidConfirm = async () => {
    try {
      const res = await acceptBidMutation.mutateAsync(id);
      setAcceptBidDialogOpen(false);
      toast({
        title: 'Bid Accepted',
        description: 'Agreement created! Other active bids have been declined.',
      });
      if (res?.agreement?.id) {
        router.push(`/agreements/${res.agreement.id}`);
      }
    } catch (err) {
      await handleConflictError(err);
    }
  };

  const handleAcceptCounterConfirm = async () => {
    try {
      const res = await acceptCounterMutation.mutateAsync(id);
      setAcceptCounterDialogOpen(false);
      toast({
        title: 'Counter-offer Accepted',
        description: 'Agreement created with updated parameters!',
      });
      if (res?.agreement?.id) {
        router.push(`/agreements/${res.agreement.id}`);
      }
    } catch (err) {
      await handleConflictError(err);
    }
  };

  if (isLoading) {
    return (
      <RequireAuth>
        <div className="container mx-auto px-4 py-8 sm:px-6 max-w-4xl space-y-6">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </RequireAuth>
    );
  }

  if (isError || !bid) {
    return (
      <RequireAuth>
        <div className="container mx-auto px-4 py-16 sm:px-6 max-w-2xl text-center">
          <ErrorState
            title="Proposal not found"
            message={
              error instanceof ApiError && error.status === 404
                ? 'This bid could not be found or you do not have permission to view it.'
                : 'Unable to load proposal details. Please try again.'
            }
            onRetry={() => void refetch()}
          />
        </div>
      </RequireAuth>
    );
  }

  const isBidder = actorRole === 'bidder';
  const isOwner = actorRole === 'owner';

  // Permission check
  if (!isBidder && !isOwner) {
    return (
      <RequireAuth>
        <div className="container mx-auto px-4 py-16 sm:px-6 max-w-2xl text-center">
          <EmptyState
            icon={Gavel}
            title="Unauthorized Access"
            description="You are neither the bidder nor the listing owner for this proposal."
            action={
              <Button asChild>
                <Link href="/listings">Browse Listings</Link>
              </Button>
            }
          />
        </div>
      </RequireAuth>
    );
  }

  // Transitions
  const canEdit = isBidder && canBidTransition(bid.status, 'EDIT', 'bidder');
  const canWithdraw = isBidder && canBidTransition(bid.status, 'WITHDRAW', 'bidder');
  const canAcceptCounter = isBidder && canBidTransition(bid.status, 'ACCEPT_COUNTER', 'bidder');

  const canShortlist = isOwner && canBidTransition(bid.status, 'SHORTLIST', 'owner');
  const canCounter = isOwner && canBidTransition(bid.status, 'COUNTER', 'owner');
  const canReject = isOwner && canBidTransition(bid.status, 'REJECT', 'owner');
  const canAccept = isOwner && canBidTransition(bid.status, 'ACCEPT', 'owner');

  const revisions = bid.revisions ?? [];

  return (
    <RequireAuth>
      <div className="container mx-auto px-4 py-8 sm:px-6 max-w-4xl space-y-8">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link
            href={isBidder ? '/bids' : `/listings/${bid.listingId}`}
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{isBidder ? 'My Bids' : 'Back to Listing'}</span>
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium truncate max-w-md">
            Proposal for {bid.listing?.title || 'Listing'}
          </span>
        </div>

        {/* Overview Header Card */}
        <div className="rounded-lg border border-border bg-card p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-foreground">Negotiation Thread</h1>
                <BidStatusBadge status={bid.status} />
              </div>
              {bid.listing && (
                <p className="text-sm text-muted-foreground">
                  Listing:{' '}
                  <Link
                    href={`/listings/${bid.listingId}`}
                    className="text-primary hover:underline font-medium inline-flex items-center gap-1"
                  >
                    {bid.listing.title} <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </p>
              )}
            </div>

            {/* Price & Delivery Highlights */}
            <div className="flex items-center gap-6 rounded-md bg-muted/40 px-4 py-3 border border-border">
              <div>
                <span className="text-xs uppercase text-muted-foreground font-semibold">
                  Current Amount
                </span>
                <p className="text-xl font-bold text-foreground">
                  {formatMoney(bid.amountCents, bid.currency)}
                </p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div>
                <span className="text-xs uppercase text-muted-foreground font-semibold">
                  Delivery Timeline
                </span>
                <p className="text-sm font-semibold text-foreground flex items-center gap-1 mt-1">
                  <Clock className="h-4 w-4 text-primary" />
                  {bid.deliveryDays} {bid.deliveryDays === 1 ? 'day' : 'days'}
                </p>
              </div>
            </div>
          </div>

          {/* Participants */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-border">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={bid.bidder.avatarUrl || undefined} alt={bid.bidder.displayName} />
                <AvatarFallback>{bid.bidder.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <span className="text-xs text-muted-foreground uppercase font-semibold">
                  Bidder
                </span>
                <p className="font-semibold text-foreground truncate">{bid.bidder.displayName}</p>
              </div>
            </div>

            {bid.listing?.owner && (
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage
                    src={bid.listing.owner.avatarUrl || undefined}
                    alt={bid.listing.owner.displayName}
                  />
                  <AvatarFallback>
                    {bid.listing.owner.displayName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <span className="text-xs text-muted-foreground uppercase font-semibold">
                    Listing Owner
                  </span>
                  <p className="font-semibold text-foreground truncate">
                    {bid.listing.owner.displayName}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-border">
            {/* Bidder Specific Actions */}
            {isBidder && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canEdit}
                  onClick={() => setEditDialogOpen(true)}
                >
                  <Edit3 className="h-3.5 w-3.5 mr-1.5" />
                  Edit Proposal
                </Button>

                <Button
                  variant="destructive"
                  size="sm"
                  disabled={!canWithdraw}
                  onClick={() => setWithdrawDialogOpen(true)}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1.5" />
                  Withdraw Proposal
                </Button>

                {canAcceptCounter && (
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => setAcceptCounterDialogOpen(true)}
                  >
                    <Check className="h-3.5 w-3.5 mr-1.5" />
                    Accept Counter-Offer
                  </Button>
                )}

                <Button variant="outline" size="sm" onClick={() => setMessagePlaceholderOpen(true)}>
                  <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                  Message Owner
                </Button>
              </>
            )}

            {/* Owner Specific Actions */}
            {isOwner && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canShortlist || shortlistMutation.isPending}
                  onClick={() => {
                    void handleShortlist();
                  }}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Shortlist
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canCounter}
                  onClick={() => setCounterDialogOpen(true)}
                >
                  <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />
                  Counter-Offer
                </Button>

                <Button
                  variant="destructive"
                  size="sm"
                  disabled={!canReject}
                  onClick={() => setRejectDialogOpen(true)}
                >
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  Reject
                </Button>

                <Button
                  size="sm"
                  disabled={!canAccept}
                  onClick={() => setAcceptBidDialogOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                  Accept Proposal
                </Button>

                <Button variant="outline" size="sm" onClick={() => setMessagePlaceholderOpen(true)}>
                  <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                  Message Bidder
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Revision History Timeline */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Negotiation History</h2>
          </div>

          {revisions.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              {bid.message || 'Initial proposal submitted without message note.'}
            </div>
          ) : (
            <div className="relative border-l-2 border-border ml-4 pl-6 space-y-6">
              {revisions.map((rev) => {
                const isBidderAuthor = rev.authorId === bid.bidder.id;
                const authorName =
                  rev.author?.displayName ||
                  (isBidderAuthor ? bid.bidder.displayName : 'Listing Owner');

                return (
                  <div key={rev.id} className="relative" data-testid={`revision-item-${rev.id}`}>
                    {/* Timeline bullet dot */}
                    <div className="absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full border-2 border-background bg-primary" />

                    <div className="rounded-lg border border-border bg-card p-4 space-y-3 shadow-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="text-xs">
                              {authorName.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-semibold text-foreground text-sm">
                            {authorName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {isBidderAuthor ? '(Bidder Revision)' : '(Owner Counter-Offer)'}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(rev.createdAt)}
                        </span>
                      </div>

                      <div className="flex items-center gap-6 text-sm">
                        <div>
                          <span className="text-xs text-muted-foreground">Amount: </span>
                          <strong className="text-foreground">
                            {formatMoney(rev.amountCents, bid.currency)}
                          </strong>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">Delivery: </span>
                          <strong className="text-foreground">
                            {rev.deliveryDays} {rev.deliveryDays === 1 ? 'day' : 'days'}
                          </strong>
                        </div>
                      </div>

                      <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/30 p-3 rounded-md">
                        {rev.message}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Dialogs */}
        {/* Bidder Edit Dialog */}
        {bid.listing && (
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Proposal</DialogTitle>
                <DialogDescription>
                  Update your proposal terms. Submitting changes creates a new revision and resets
                  the status to Pending.
                </DialogDescription>
              </DialogHeader>

              <BidForm
                listing={bid.listing}
                initialBid={bid}
                onSubmit={handleEditSubmit}
                onCancel={() => setEditDialogOpen(false)}
                isLoading={updateMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        )}

        {/* Bidder Withdraw Dialog */}
        <ConfirmDialog
          open={withdrawDialogOpen}
          onOpenChange={setWithdrawDialogOpen}
          title="Withdraw Proposal"
          description="Are you sure you want to withdraw this bid? The listing owner will no longer be able to accept it."
          confirmText="Withdraw Bid"
          variant="destructive"
          isLoading={withdrawMutation.isPending}
          onConfirm={handleWithdrawConfirm}
        />

        {/* Bidder Accept Counter Dialog */}
        <ConfirmDialog
          open={acceptCounterDialogOpen}
          onOpenChange={setAcceptCounterDialogOpen}
          title="Accept Counter-Offer"
          description="Accept the owner's proposed terms? This will formalize the project agreement with the counter-offer amount and delivery timeline."
          confirmText="Accept & Start Project"
          variant="primary"
          isLoading={acceptCounterMutation.isPending}
          onConfirm={handleAcceptCounterConfirm}
        />

        {/* Owner Reject Dialog */}
        <RejectDialog
          open={rejectDialogOpen}
          onOpenChange={setRejectDialogOpen}
          onConfirm={handleRejectConfirm}
          isLoading={rejectMutation.isPending}
        />

        {/* Owner Counter Dialog */}
        <CounterDialog
          open={counterDialogOpen}
          onOpenChange={setCounterDialogOpen}
          bid={bid}
          onConfirm={handleCounterConfirm}
          isLoading={counterMutation.isPending}
        />

        {/* Owner Accept Bid Dialog */}
        <ConfirmDialog
          open={acceptBidDialogOpen}
          onOpenChange={setAcceptBidDialogOpen}
          title="Accept Proposal & Create Agreement"
          description="Are you sure you want to accept this proposal? All other active bids on this listing will be declined and an agreement will be created."
          confirmText="Accept Proposal"
          variant="primary"
          isLoading={acceptBidMutation.isPending}
          onConfirm={handleAcceptBidConfirm}
        />

        {/* Placeholder dialog for WEB-04 */}
        <ConfirmDialog
          open={messagePlaceholderOpen}
          onOpenChange={setMessagePlaceholderOpen}
          title={isBidder ? 'Message Owner' : 'Message Bidder'}
          description="Direct 1:1 real-time messaging and chat will be implemented in task WEB-04."
          confirmText="Got it"
          onConfirm={() => setMessagePlaceholderOpen(false)}
        />
      </div>
    </RequireAuth>
  );
}

export default function BidDetailPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex justify-center p-12">
          <Spinner size="lg" label="Loading..." />
        </div>
      }
    >
      <BidDetailPageContent />
    </React.Suspense>
  );
}
