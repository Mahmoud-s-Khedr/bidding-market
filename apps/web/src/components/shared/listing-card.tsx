import * as React from 'react';
import Link from 'next/link';
import { Clock, MapPin, MessageSquare, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PriceTag } from './price-tag';
import { RatingStars } from './rating-stars';
import type { ListingSummary } from '@/lib/api/types';

export interface ListingCardProps {
  listing: ListingSummary;
  className?: string;
}

export function ListingCard({ listing, className }: ListingCardProps) {
  const isRequest = listing.kind === 'REQUEST';
  const firstImage = listing.images && listing.images.length > 0 ? listing.images[0] : null;

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xs transition-all hover:shadow-md hover:border-primary/40',
        className,
      )}
    >
      {/* Thumbnail */}
      <Link
        href={`/listings/${listing.id}`}
        className="relative aspect-video w-full overflow-hidden bg-muted/40"
        tabIndex={-1}
        aria-hidden="true"
      >
        {firstImage ? (
          <img
            src={firstImage.url}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted/30 text-muted-foreground/40">
            <Tag className="h-10 w-10" />
          </div>
        )}

        {/* Kind badge */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          <Badge
            variant={isRequest ? 'default' : 'secondary'}
            className="text-[11px] font-semibold tracking-wide uppercase px-2 py-0.5 shadow-xs"
          >
            {isRequest ? 'Request' : 'Offer'}
          </Badge>

          {listing.status !== 'OPEN' && (
            <Badge variant="outline" className="text-[10px] bg-background/80 backdrop-blur-xs">
              {listing.status}
            </Badge>
          )}
        </div>
      </Link>

      {/* Card Content */}
      <div className="flex flex-1 flex-col p-4">
        {/* Category & Location */}
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          {listing.category ? (
            <Link
              href={`/categories/${listing.category.slug}`}
              className="truncate hover:text-primary transition-colors font-medium"
            >
              {listing.category.name}
            </Link>
          ) : (
            <span className="truncate font-medium text-muted-foreground/80">
              {listing.categoryId}
            </span>
          )}

          {listing.location && (
            <span className="flex items-center gap-1 shrink-0 ml-2">
              <MapPin className="h-3 w-3" />
              <span className="truncate max-w-[120px]">{listing.location}</span>
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-base font-semibold text-foreground line-clamp-2 mb-2 group-hover:text-primary transition-colors">
          <Link href={`/listings/${listing.id}`} className="focus:outline-none">
            {listing.title}
          </Link>
        </h3>

        {/* Price */}
        <div className="mb-3">
          <PriceTag
            priceType={listing.priceType}
            priceMinCents={listing.priceMinCents}
            priceMaxCents={listing.priceMaxCents}
            currency={listing.currency}
            size="md"
          />
        </div>

        {/* Footer Meta */}
        <div className="mt-auto pt-3 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
          {/* Owner info */}
          <Link
            href={`/users/${listing.owner.id}`}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity min-w-0"
          >
            <Avatar className="h-6 w-6">
              <AvatarImage
                src={listing.owner.avatarUrl || undefined}
                alt={listing.owner.displayName}
              />
              <AvatarFallback className="text-[10px]">
                {listing.owner.displayName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="truncate">
              <span className="truncate block font-medium text-foreground">
                {listing.owner.displayName}
              </span>
            </div>
          </Link>

          {/* Rating or Bids Count */}
          <div className="flex items-center gap-2 shrink-0">
            {typeof listing.owner.ratingAvg === 'number' && listing.owner.ratingAvg > 0 ? (
              <RatingStars
                rating={listing.owner.ratingAvg}
                count={listing.owner.ratingCount}
                size="sm"
                showCount={false}
              />
            ) : null}

            <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
              <MessageSquare className="h-3 w-3" />
              <span>{listing.bidCount}</span>
            </span>
          </div>
        </div>

        {listing.deliveryDays ? (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-2">
            <Clock className="h-3 w-3" />
            <span>
              Delivery: {listing.deliveryDays} {listing.deliveryDays === 1 ? 'day' : 'days'}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
