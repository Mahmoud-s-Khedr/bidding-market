import * as React from 'react';
import { Star, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { RatingStars } from '@/components/shared/rating-stars';
import { formatDate, getInitials } from '@/lib/format';
import { safeMediaUrl } from '@/lib/safe-url';
import { useSubmitReview } from '@/lib/api/agreements';
import { useUserReviews } from '@/lib/api/users';
import { ApiError } from '@/lib/api/client';
import type { AgreementDetail } from '@market/shared';
import type { ReviewItem } from '@/lib/api/types';

interface AgreementReviewsProps {
  agreement: AgreementDetail;
  viewerId?: string;
  onRefetch?: () => void;
}

export function AgreementReviews({ agreement, viewerId, onRefetch }: AgreementReviewsProps) {
  const isCompleted = agreement.status === 'COMPLETED';

  const isBuyer = agreement.myRole === 'buyer' || agreement.buyer.id === viewerId;
  const otherParty = isBuyer ? agreement.provider : agreement.buyer;

  const submitMutation = useSubmitReview(agreement.id, { viewerId });

  // Reviews targeting otherParty
  const {
    data: targetReviewsData,
    fetchNextPage: fetchNextTargetReviews,
    hasNextPage: hasNextTargetReviews,
    isFetching: isFetchingTargetReviews,
    isLoading: isLoadingTargetReviews,
    refetch: refetchTargetReviews,
  } = useUserReviews(otherParty.id, {
    enabled: isCompleted,
  });

  // Reviews targeting viewer
  const {
    data: viewerReviewsData,
    fetchNextPage: fetchNextViewerReviews,
    hasNextPage: hasNextViewerReviews,
    isFetching: isFetchingViewerReviews,
    refetch: refetchViewerReviews,
  } = useUserReviews(viewerId ?? '', {
    enabled: isCompleted && Boolean(viewerId),
  });

  const [rating, setRating] = React.useState<number>(5);
  const [hoverRating, setHoverRating] = React.useState<number | null>(null);
  const [comment, setComment] = React.useState('');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [localSubmittedReview, setLocalSubmittedReview] = React.useState<ReviewItem | null>(null);

  // References for roving tabindex radio buttons
  const starRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  // Find all reviews related to this agreement
  const allTargetReviews: ReviewItem[] = React.useMemo(() => {
    if (!targetReviewsData?.pages) return [];
    return targetReviewsData.pages.flatMap((p) => p.items);
  }, [targetReviewsData]);

  const allViewerReviews: ReviewItem[] = React.useMemo(() => {
    if (!viewerReviewsData?.pages) return [];
    return viewerReviewsData.pages.flatMap((p) => p.items);
  }, [viewerReviewsData]);

  // Review written by viewer about otherParty
  const existingMyReview = React.useMemo(() => {
    if (localSubmittedReview) return localSubmittedReview;
    return allTargetReviews.find(
      (r) => r.agreementId === agreement.id && r.author?.id === viewerId,
    );
  }, [allTargetReviews, agreement.id, viewerId, localSubmittedReview]);

  // Review written by otherParty about viewer
  const counterpartReview = React.useMemo(() => {
    return allViewerReviews.find(
      (r) => r.agreementId === agreement.id && r.author?.id === otherParty.id,
    );
  }, [allViewerReviews, agreement.id, otherParty.id]);

  // Page through reviews until my review is found or pages exhausted
  React.useEffect(() => {
    if (!existingMyReview && hasNextTargetReviews && !isFetchingTargetReviews) {
      void fetchNextTargetReviews();
    }
  }, [existingMyReview, hasNextTargetReviews, isFetchingTargetReviews, fetchNextTargetReviews]);

  // Page through reviews until counterpart review is found or pages exhausted
  React.useEffect(() => {
    if (!counterpartReview && hasNextViewerReviews && !isFetchingViewerReviews) {
      void fetchNextViewerReviews();
    }
  }, [counterpartReview, hasNextViewerReviews, isFetchingViewerReviews, fetchNextViewerReviews]);

  if (!isCompleted) {
    return null;
  }

  // Prevent flash of review form while checking if already reviewed
  const isSearchingMyReview =
    !existingMyReview &&
    (isLoadingTargetReviews || (hasNextTargetReviews && isFetchingTargetReviews));

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (rating < 1 || rating > 5) {
      setErrorMsg('Please select a rating between 1 and 5 stars.');
      return;
    }

    const trimmedComment = comment.trim();
    if (trimmedComment.length > 2000) {
      setErrorMsg('Comment cannot exceed 2000 characters.');
      return;
    }

    try {
      const res = await submitMutation.mutateAsync({
        rating,
        comment: trimmedComment || undefined,
      });
      toast.success('Review submitted', 'Thank you for your feedback!');
      setLocalSubmittedReview(res);
      void refetchTargetReviews();
      void refetchViewerReviews();
      onRefetch?.();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setErrorMsg('You have already submitted a review for this agreement.');
          void refetchTargetReviews();
          void refetchViewerReviews();
        } else {
          setErrorMsg(err.message);
        }
      } else {
        setErrorMsg('Failed to submit review. Please try again.');
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, starValue: number) => {
    let nextValue: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextValue = starValue === 5 ? 1 : starValue + 1;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextValue = starValue === 1 ? 5 : starValue - 1;
    } else if (e.key === 'Home') {
      nextValue = 1;
    } else if (e.key === 'End') {
      nextValue = 5;
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      setRating(starValue);
      return;
    }

    if (nextValue !== null) {
      e.preventDefault();
      setRating(nextValue);
      starRefs.current[nextValue - 1]?.focus();
    }
  };

  return (
    <Card className="p-6 mb-6 shadow-xs border-border/80">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-foreground">Feedback & Reviews</h2>
        <p className="text-xs text-muted-foreground">
          Ratings and reviews shared between transaction participants.
        </p>
      </div>

      {/* Review Form or Loading or Read-only card */}
      {isSearchingMyReview ? (
        <div
          className="p-4 rounded-lg bg-muted/30 border border-border space-y-3 mb-4"
          data-testid="reviews-loading"
        >
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : !existingMyReview ? (
        <form
          onSubmit={(e) => {
            void handleSubmitReview(e);
          }}
          className="p-4 rounded-lg bg-muted/30 border border-border space-y-4 mb-4"
          aria-label="Submit review form"
        >
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Rate your experience with {otherParty.displayName}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Please provide an honest rating and optional review comments.
            </p>
          </div>

          {/* Accessible star rating radio group with roving tabindex */}
          <div className="space-y-1.5">
            <Label id="rating-group-label" className="text-xs">
              Rating (1 to 5 stars) *
            </Label>
            <div
              role="radiogroup"
              aria-labelledby="rating-group-label"
              className="flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md p-1"
            >
              {[1, 2, 3, 4, 5].map((starValue) => {
                const activeValue = hoverRating ?? rating;
                const isFilled = activeValue >= starValue;

                return (
                  <button
                    key={starValue}
                    ref={(el) => {
                      starRefs.current[starValue - 1] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={rating === starValue}
                    aria-label={`${starValue} star${starValue > 1 ? 's' : ''}`}
                    tabIndex={rating === starValue ? 0 : -1}
                    onMouseEnter={() => setHoverRating(starValue)}
                    onMouseLeave={() => setHoverRating(null)}
                    onClick={() => setRating(starValue)}
                    onKeyDown={(e) => handleKeyDown(e, starValue)}
                    className="p-1 rounded-sm text-muted-foreground hover:scale-110 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Star
                      className={`h-6 w-6 transition-colors ${
                        isFilled
                          ? 'fill-amber-400 text-amber-400'
                          : 'fill-muted-foreground/20 text-muted-foreground/30'
                      }`}
                    />
                  </button>
                );
              })}
              <span className="text-xs font-semibold text-muted-foreground ml-2">
                {rating} of 5 stars
              </span>
            </div>
          </div>

          {/* Optional comment */}
          <div className="space-y-1.5">
            <Label htmlFor="review-comment" className="text-xs">
              Review Comment (optional)
            </Label>
            <Textarea
              id="review-comment"
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="Share how the collaboration went, communication quality, work timeliness..."
              rows={3}
            />
          </div>

          {errorMsg && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" /> {errorMsg}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" size="sm" isLoading={submitMutation.isPending}>
              Submit Review
            </Button>
          </div>
        </form>
      ) : (
        /* Read-only card of my review */
        <div className="space-y-3 mb-4">
          <div className="p-4 rounded-lg bg-card border border-border space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground">Your Review</span>
                <span className="text-xs text-muted-foreground">for {otherParty.displayName}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {formatDate(existingMyReview.createdAt)}
              </span>
            </div>

            <RatingStars rating={existingMyReview.rating} showCount={false} size="sm" />

            {existingMyReview.comment && (
              <p className="text-xs text-foreground mt-1 whitespace-pre-wrap">
                {existingMyReview.comment}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Read-only card of otherParty review about viewer if present */}
      {counterpartReview && (
        <div className="p-4 rounded-lg bg-card border border-border space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                {otherParty.avatarUrl && (
                  <AvatarImage
                    src={safeMediaUrl(otherParty.avatarUrl)}
                    alt={otherParty.displayName}
                  />
                )}
                <AvatarFallback className="text-[10px]">
                  {getInitials(otherParty.displayName)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-bold text-foreground">
                {otherParty.displayName}&apos;s Review
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {formatDate(counterpartReview.createdAt)}
            </span>
          </div>

          <RatingStars rating={counterpartReview.rating} showCount={false} size="sm" />

          {counterpartReview.comment && (
            <p className="text-xs text-foreground mt-1 whitespace-pre-wrap">
              {counterpartReview.comment}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
