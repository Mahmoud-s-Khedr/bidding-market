'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Filter,
  PackageSearch,
  PlusCircle,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ListingCard } from '@/components/shared/listing-card';
import { CategorySelect } from '@/components/shared/category-select';
import { useListings } from '@/lib/api/listings';
import type { ListingFilters, ListingKind, ListingSort } from '@/lib/api/types';

interface ListingsViewProps {
  initialCategorySlug?: string;
}

export function ListingsContent({ initialCategorySlug }: ListingsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Mobile drawer state
  const [mobileFilterOpen, setMobileFilterOpen] = React.useState(false);

  // Read current filters from URL search params
  const qParam = searchParams.get('q') || '';
  const kindParam = (searchParams.get('kind') as ListingKind | 'all') || 'all';
  const categorySlugParam = initialCategorySlug || searchParams.get('categorySlug') || '';
  const minPriceParam = searchParams.get('minPrice') || '';
  const maxPriceParam = searchParams.get('maxPrice') || '';
  const locationParam = searchParams.get('location') || '';
  const rawSortParam = searchParams.get('sort') as ListingSort | null;

  // Relevance is default sort when q is set; newest is default otherwise
  const defaultSort: ListingSort = qParam.trim() ? 'relevance' : 'newest';
  const effectiveSort: ListingSort = rawSortParam || defaultSort;

  // Local draft states for debounced text inputs
  const [searchInput, setSearchInput] = React.useState(qParam);
  const [locationInput, setLocationInput] = React.useState(locationParam);
  const [minPriceInput, setMinPriceInput] = React.useState(minPriceParam);
  const [maxPriceInput, setMaxPriceInput] = React.useState(maxPriceParam);

  // Track last values pushed to URL to avoid overwriting typing while router.replace is in flight
  const lastPushedRef = React.useRef({
    q: qParam,
    location: locationParam,
    minPrice: minPriceParam,
    maxPrice: maxPriceParam,
  });

  // URL updating helper using router.replace to avoid flooding history
  const updateUrl = React.useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '' || value === undefined) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
        if (key in lastPushedRef.current) {
          lastPushedRef.current[key as keyof typeof lastPushedRef.current] = value ?? '';
        }
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [searchParams, pathname, router],
  );

  // Sync inputs when URL params change externally (only if URL value differs from last value pushed by this page)
  React.useEffect(() => {
    if (qParam !== lastPushedRef.current.q) {
      setSearchInput(qParam);
      lastPushedRef.current.q = qParam;
    }
  }, [qParam]);
  React.useEffect(() => {
    if (locationParam !== lastPushedRef.current.location) {
      setLocationInput(locationParam);
      lastPushedRef.current.location = locationParam;
    }
  }, [locationParam]);
  React.useEffect(() => {
    if (minPriceParam !== lastPushedRef.current.minPrice) {
      setMinPriceInput(minPriceParam);
      lastPushedRef.current.minPrice = minPriceParam;
    }
  }, [minPriceParam]);
  React.useEffect(() => {
    if (maxPriceParam !== lastPushedRef.current.maxPrice) {
      setMaxPriceInput(maxPriceParam);
      lastPushedRef.current.maxPrice = maxPriceParam;
    }
  }, [maxPriceParam]);

  // Debounce search query (300 ms)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput.trim() !== qParam) {
        updateUrl({ q: searchInput.trim() || null });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, qParam, updateUrl]);

  // Debounce location query (300 ms)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (locationInput.trim() !== locationParam) {
        updateUrl({ location: locationInput.trim() || null });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [locationInput, locationParam, updateUrl]);

  // Debounce min price (300 ms)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (minPriceInput !== minPriceParam) {
        updateUrl({ minPrice: minPriceInput || null });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [minPriceInput, minPriceParam, updateUrl]);

  // Debounce max price (300 ms)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (maxPriceInput !== maxPriceParam) {
        updateUrl({ maxPrice: maxPriceInput || null });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [maxPriceInput, maxPriceParam, updateUrl]);

  // Construct API filter object
  const activeFilters = React.useMemo<ListingFilters>(() => {
    const filters: ListingFilters = {
      sort: effectiveSort,
      status: 'OPEN',
    };
    if (qParam.trim()) filters.q = qParam.trim();
    if (kindParam && kindParam !== 'all') filters.kind = kindParam;
    if (categorySlugParam) filters.categorySlug = categorySlugParam;
    if (minPriceParam && !Number.isNaN(Number(minPriceParam))) {
      const val = Math.round(Number(minPriceParam) * 100);
      if (val >= 0 && val <= 2147483647) {
        filters.minPrice = val;
      }
    }
    if (maxPriceParam && !Number.isNaN(Number(maxPriceParam))) {
      const val = Math.round(Number(maxPriceParam) * 100);
      if (val >= 0 && val <= 2147483647) {
        filters.maxPrice = val;
      }
    }
    if (locationParam.trim()) filters.location = locationParam.trim();
    return filters;
  }, [
    qParam,
    kindParam,
    categorySlugParam,
    minPriceParam,
    maxPriceParam,
    locationParam,
    effectiveSort,
  ]);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useListings(activeFilters);

  const listings = React.useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);

  // Count active non-default filters
  const activeFilterCount = React.useMemo(() => {
    let count = 0;
    if (qParam) count++;
    if (kindParam !== 'all') count++;
    if (categorySlugParam && !initialCategorySlug) count++;
    if (minPriceParam) count++;
    if (maxPriceParam) count++;
    if (locationParam) count++;
    if (rawSortParam && rawSortParam !== defaultSort) count++;
    return count;
  }, [
    qParam,
    kindParam,
    categorySlugParam,
    initialCategorySlug,
    minPriceParam,
    maxPriceParam,
    locationParam,
    rawSortParam,
    defaultSort,
  ]);

  const handleClearFilters = () => {
    setSearchInput('');
    setLocationInput('');
    setMinPriceInput('');
    setMaxPriceInput('');
    lastPushedRef.current = { q: '', location: '', minPrice: '', maxPrice: '' };
    const params = new URLSearchParams();
    if (initialCategorySlug) {
      params.set('categorySlug', initialCategorySlug);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  // IntersectionObserver for infinite scrolling
  const sentinelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!sentinelRef.current || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Filter UI component (rendered in sidebar and mobile dialog)
  const renderFilterControls = () => (
    <div className="space-y-6">
      {/* Kind filter */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider block">
          Kind
        </span>
        <Tabs
          value={kindParam}
          onValueChange={(val) => updateUrl({ kind: val === 'all' ? null : val })}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="REQUEST">Requests</TabsTrigger>
            <TabsTrigger value="OFFER">Offers</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Category tree filter (unless fixed by initialCategorySlug) */}
      {!initialCategorySlug && (
        <div className="space-y-2">
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider block">
            Category
          </span>
          <CategorySelect
            value={categorySlugParam}
            valueType="slug"
            placeholder="All Categories"
            onValueChange={(val) => updateUrl({ categorySlug: val || null })}
          />
          {categorySlugParam && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => updateUrl({ categorySlug: null })}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3 mr-1" />
              Clear category
            </Button>
          )}
        </div>
      )}

      {/* Price Range */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider block">
          Budget / Price
        </span>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            min="0"
            max="21474836.47"
            placeholder="Min"
            value={minPriceInput}
            onChange={(e) => setMinPriceInput(e.target.value)}
            className="h-9 text-sm"
          />
          <Input
            type="number"
            min="0"
            max="21474836.47"
            placeholder="Max"
            value={maxPriceInput}
            onChange={(e) => setMaxPriceInput(e.target.value)}
            className="h-9 text-sm"
          />
        </div>
      </div>

      {/* Location */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider block">
          Location
        </span>
        <Input
          type="text"
          placeholder="City, region, or remote"
          value={locationInput}
          onChange={(e) => setLocationInput(e.target.value)}
          className="h-9 text-sm"
        />
      </div>

      {activeFilterCount > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClearFilters}
          className="w-full text-xs"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Reset all filters
        </Button>
      )}
    </div>
  );

  return (
    <div className="container mx-auto px-4 py-8 sm:px-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Marketplace Listings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse requests and offers or submit a bid to fulfill them.
          </p>
        </div>

        <Button asChild>
          <Link href="/listings/new">
            <PlusCircle className="h-4 w-4 mr-2" />
            Post a Listing
          </Link>
        </Button>
      </div>

      {/* Search and Sort Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6 pb-6 border-b border-border">
        {/* Search Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateUrl({ q: searchInput.trim() || null });
          }}
          className="relative flex-1 max-w-md"
        >
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search keywords, titles, skills..."
            className="pl-9 h-10"
            aria-label="Search listings"
          />
        </form>

        <div className="flex items-center gap-3">
          {/* Mobile Filter Trigger */}
          <Button
            type="button"
            variant="outline"
            className="md:hidden flex items-center gap-2"
            onClick={() => setMobileFilterOpen(true)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>

          {/* Sort Select */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline whitespace-nowrap">
              Sort by:
            </span>
            <Select
              value={effectiveSort}
              onValueChange={(val) => updateUrl({ sort: val === defaultSort ? null : val })}
            >
              <SelectTrigger className="w-[160px] h-10 text-sm">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relevance">Relevance</SelectItem>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="price_asc">Price: Low to High</SelectItem>
                <SelectItem value="price_desc">Price: High to Low</SelectItem>
                <SelectItem value="ending_soon">Ending Soon</SelectItem>
                <SelectItem value="most_bids">Most Bids</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Layout Grid: Sidebar Filters + Main Results */}
      <div className="flex gap-8 items-start">
        {/* Desktop Sidebar */}
        <aside className="w-64 shrink-0 hidden md:block rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2 pb-4 mb-4 border-b border-border">
            <Filter className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Filters</span>
            {activeFilterCount > 0 && (
              <span className="ml-auto text-xs text-muted-foreground">
                ({activeFilterCount} active)
              </span>
            )}
          </div>
          {renderFilterControls()}
        </aside>

        {/* Mobile Filter Drawer / Dialog */}
        <Dialog open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" />
                <span>Filter Listings</span>
              </DialogTitle>
            </DialogHeader>
            <div className="pt-2">{renderFilterControls()}</div>
          </DialogContent>
        </Dialog>

        {/* Results Area */}
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="space-y-3">
                  <Skeleton className="aspect-video w-full rounded-lg" />
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <ErrorState
              title="Unable to load listings"
              message={
                error instanceof Error
                  ? error.message
                  : 'An error occurred while fetching listings from the server.'
              }
              onRetry={() => void refetch()}
            />
          ) : listings.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title="No listings found"
              description="No requests or offers matched your filter criteria. Try adjusting or clearing your filters."
              action={
                activeFilterCount > 0 ? (
                  <Button variant="outline" onClick={handleClearFilters}>
                    Clear all filters
                  </Button>
                ) : (
                  <Button asChild>
                    <Link href="/listings/new">Post a Listing</Link>
                  </Button>
                )
              }
            />
          ) : (
            <div className="space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {listings.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>

              {/* Infinite scroll loader & sentinel */}
              <div className="flex flex-col items-center justify-center pt-4">
                {hasNextPage ? (
                  <div className="space-y-4 text-center">
                    <Button
                      variant="outline"
                      onClick={() => void fetchNextPage()}
                      disabled={isFetchingNextPage}
                      isLoading={isFetchingNextPage}
                    >
                      {isFetchingNextPage ? 'Loading more...' : 'Load more'}
                    </Button>
                    <div ref={sentinelRef} className="h-1 w-full" />
                  </div>
                ) : listings.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    You have reached the end of the results.
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ListingsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="container mx-auto px-4 py-8 sm:px-6 space-y-6">
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <Skeleton className="aspect-video w-full rounded-lg" />
            <Skeleton className="aspect-video w-full rounded-lg" />
            <Skeleton className="aspect-video w-full rounded-lg" />
          </div>
        </div>
      }
    >
      <ListingsContent />
    </React.Suspense>
  );
}
