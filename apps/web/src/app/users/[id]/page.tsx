'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Briefcase,
  Calendar,
  CheckCircle,
  MapPin,
  MessageSquare,
  PackageSearch,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { RatingStars } from '@/components/shared/rating-stars';
import { ListingCard } from '@/components/shared/listing-card';
import { usePublicUser, useUserReviews } from '@/lib/api/users';
import { useListings } from '@/lib/api/listings';
import { formatDate } from '@/lib/format';
import { ApiError } from '@/lib/api/client';

export default function UserProfilePage() {
  const params = useParams();
  const id = (params?.id as string) || '';

  const {
    data: user,
    isLoading: userLoading,
    isError: userError,
    error: userErr,
    refetch: refetchUser,
  } = usePublicUser(id);

  // User's OPEN listings
  const {
    data: listingsData,
    isLoading: listingsLoading,
    hasNextPage: hasMoreListings,
    isFetchingNextPage: isFetchingMoreListings,
    fetchNextPage: fetchMoreListings,
  } = useListings({ ownerId: id, status: 'OPEN' });

  // User's reviews
  const {
    data: reviewsData,
    isLoading: reviewsLoading,
    hasNextPage: hasMoreReviews,
    isFetchingNextPage: isFetchingMoreReviews,
    fetchNextPage: fetchMoreReviews,
  } = useUserReviews(id);

  const listings = React.useMemo(
    () => listingsData?.pages.flatMap((p) => p.items) ?? [],
    [listingsData],
  );

  const reviews = React.useMemo(
    () => reviewsData?.pages.flatMap((p) => p.items) ?? [],
    [reviewsData],
  );

  if (userLoading) {
    return (
      <div className="container mx-auto px-4 py-10 sm:px-6 max-w-5xl space-y-8">
        <div className="flex items-start gap-6 p-6 rounded-xl border border-border bg-card">
          <Skeleton className="h-24 w-24 rounded-full" />
          <div className="space-y-3 flex-1">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
            <Skeleton className="h-4 w-36" />
          </div>
        </div>
      </div>
    );
  }

  if (
    userError &&
    userErr instanceof ApiError &&
    (userErr.status === 404 || userErr.status === 400)
  ) {
    return (
      <div className="container mx-auto px-4 py-16 sm:px-6 max-w-md text-center">
        <EmptyState
          icon={PackageSearch}
          title="User Not Found"
          description="The profile you requested does not exist or has been suspended."
          action={
            <Button asChild>
              <Link href="/listings">Return to Marketplace</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (userError || !user) {
    return (
      <div className="container mx-auto px-4 py-16 sm:px-6 max-w-2xl">
        <ErrorState
          title="Unable to load profile"
          message={userErr instanceof Error ? userErr.message : 'Error fetching user profile'}
          onRetry={() => void refetchUser()}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 max-w-5xl space-y-8">
      {/* Profile Header */}
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <Avatar className="h-24 w-24 border-2 border-border text-2xl font-bold">
            <AvatarImage src={user.avatarUrl || undefined} alt={user.displayName} />
            <AvatarFallback>{user.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>

          <div className="space-y-2.5 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground truncate">
                {user.displayName}
              </h1>

              {user.isBusiness && (
                <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                  <Briefcase className="h-3 w-3" />
                  <span>Business {user.companyName ? `• ${user.companyName}` : ''}</span>
                </Badge>
              )}
            </div>

            {user.bio && (
              <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">{user.bio}</p>
            )}

            {/* Meta row: location, member since, completed count */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground pt-1">
              {user.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  <span>{user.location}</span>
                </span>
              )}

              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                <span>Member since {formatDate(user.createdAt)}</span>
              </span>

              {typeof user.completedCount === 'number' && (
                <span className="flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                  <span>{user.completedCount} completed agreements</span>
                </span>
              )}
            </div>

            {/* Rating */}
            <div className="pt-2">
              <RatingStars rating={user.ratingAvg || 0} count={user.ratingCount || 0} size="md" />
            </div>
          </div>
        </div>
      </div>

      {/* Profile Tabs: Listings and Reviews */}
      <Tabs defaultValue="listings" className="w-full">
        <TabsList className="grid w-full sm:w-[320px] grid-cols-2 mb-6">
          <TabsTrigger value="listings" className="flex items-center gap-2">
            <span>Listings</span>
            {listings.length > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] font-semibold text-primary">
                {listings.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="reviews" className="flex items-center gap-2">
            <span>Reviews</span>
            {typeof user.ratingCount === 'number' && user.ratingCount > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] font-semibold text-primary">
                {user.ratingCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Listings Tab */}
        <TabsContent value="listings" className="space-y-6">
          {listingsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="space-y-3">
                  <Skeleton className="aspect-video w-full rounded-lg" />
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))}
            </div>
          ) : listings.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title="No Active Listings"
              description={`${user.displayName} has no open requests or offers at this time.`}
            />
          ) : (
            <div className="space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {listings.map((item) => (
                  <ListingCard key={item.id} listing={item} />
                ))}
              </div>

              {hasMoreListings && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => void fetchMoreListings()}
                    disabled={isFetchingMoreListings}
                    isLoading={isFetchingMoreListings}
                  >
                    Load more listings
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Reviews Tab */}
        <TabsContent value="reviews" className="space-y-6">
          {reviewsLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="p-4 rounded-lg border border-border space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          ) : reviews.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No Reviews Yet"
              description={`${user.displayName} has not received any reviews yet.`}
            />
          ) : (
            <div className="space-y-4">
              {reviews.map((rev) => (
                <div
                  key={rev.id}
                  className="rounded-lg border border-border bg-card p-5 space-y-3 shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <Link
                      href={`/users/${rev.author.id}`}
                      className="flex items-center gap-2.5 group"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={rev.author.avatarUrl || undefined}
                          alt={rev.author.displayName}
                        />
                        <AvatarFallback className="text-xs">
                          {rev.author.displayName.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                          {rev.author.displayName}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatDate(rev.createdAt)}
                        </p>
                      </div>
                    </Link>

                    <RatingStars rating={rev.rating} showCount={false} size="sm" />
                  </div>

                  {rev.comment && (
                    <p className="text-sm text-foreground/90 leading-relaxed">{rev.comment}</p>
                  )}
                </div>
              ))}

              {hasMoreReviews && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => void fetchMoreReviews()}
                    disabled={isFetchingMoreReviews}
                    isLoading={isFetchingMoreReviews}
                  >
                    Load more reviews
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
