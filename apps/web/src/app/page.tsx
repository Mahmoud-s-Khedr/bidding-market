'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, FolderOpen, Search, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ListingCard } from '@/components/shared/listing-card';
import { useCategories } from '@/lib/api/categories';
import { useListings } from '@/lib/api/listings';

export default function HomePage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = React.useState('');

  const { data: categories = [], isLoading: categoriesLoading } = useCategories();

  const { data: requestsData, isLoading: requestsLoading } = useListings({
    kind: 'REQUEST',
    limit: 4,
    sort: 'newest',
  });

  const { data: offersData, isLoading: offersLoading } = useListings({
    kind: 'OFFER',
    limit: 4,
    sort: 'newest',
  });

  const topLevelCategories = React.useMemo(
    () => categories.filter((c) => !c.parentId),
    [categories],
  );

  const latestRequests = requestsData?.pages?.[0]?.items || [];
  const latestOffers = offersData?.pages?.[0]?.items || [];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/listings?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      router.push('/listings');
    }
  };

  return (
    <div className="flex flex-col flex-1 pb-16">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-16 md:py-24 border-b border-border bg-gradient-to-b from-primary/5 via-background to-background">
        <div className="container mx-auto px-4 sm:px-6 text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary mb-6">
            <Zap className="h-3.5 w-3.5" />
            <span>Next-Generation Bidding & Negotiation</span>
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl text-foreground mb-6">
            Where Requests Meet Offers, with <span className="text-primary">Real-Time Bidding</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
            Publish what you need or what you offer. Compare competitive bids, negotiate in
            real-time, and track milestones to project completion.
          </p>

          {/* Search Bar */}
          <form
            onSubmit={handleSearchSubmit}
            className="flex flex-col sm:flex-row items-center justify-center gap-2 max-w-xl mx-auto mb-8"
          >
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-3 h-5 w-5 text-muted-foreground pointer-events-none" />
              <Input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search requests, offers, or skills..."
                className="pl-11 h-12 text-base rounded-lg border-primary/30 focus-visible:border-primary shadow-xs"
                aria-label="Search marketplace"
              />
            </div>
            <Button size="lg" type="submit" className="h-12 w-full sm:w-auto px-6 font-semibold">
              Search
            </Button>
          </form>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="lg" asChild>
              <Link href="/listings" className="w-full sm:w-auto">
                Browse Marketplace
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Link>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <Link href="/listings/new" className="w-full sm:w-auto">
                Post Request or Offer
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Categories Grid */}
      <section className="py-12 md:py-16 container mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Explore by Category
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Find the right requests or offers by specialty.
            </p>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/listings">
              View all
              <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>

        {categoriesLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, idx) => (
              <Skeleton key={idx} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : topLevelCategories.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {topLevelCategories.map((category) => (
              <Link
                key={category.id}
                href={`/categories/${category.slug}`}
                className="group flex flex-col items-center justify-center p-4 rounded-lg border border-border bg-card hover:border-primary/50 hover:shadow-xs transition-all text-center"
              >
                <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
                  <FolderOpen className="h-5 w-5" />
                </div>
                <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                  {category.name}
                </span>
                {typeof category.listingCount === 'number' && (
                  <span className="text-xs text-muted-foreground mt-0.5">
                    {category.listingCount} {category.listingCount === 1 ? 'listing' : 'listings'}
                  </span>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No categories available.</p>
        )}
      </section>

      {/* Latest Requests Section */}
      <section className="py-10 container mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Latest Requests</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Opportunities looking for competitive bids and talented providers.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/listings?kind=REQUEST">
              View all requests
              <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>

        {requestsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="space-y-3">
                <Skeleton className="aspect-video w-full rounded-lg" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : latestRequests.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {latestRequests.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No requests posted yet.</p>
        )}
      </section>

      {/* Latest Offers Section */}
      <section className="py-10 container mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Latest Offers</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Products and services ready for immediate purchase or custom negotiation.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/listings?kind=OFFER">
              View all offers
              <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>

        {offersLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="space-y-3">
                <Skeleton className="aspect-video w-full rounded-lg" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : latestOffers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {latestOffers.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No offers posted yet.</p>
        )}
      </section>
    </div>
  );
}
