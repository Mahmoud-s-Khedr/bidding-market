import type { Metadata } from 'next';
import Link from 'next/link';
import { PackageSearch, PlusCircle } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Browse Listings — BidMarket',
  description: 'Explore active product and service requests and offers.',
};

export default function ListingsPage() {
  return (
    <div className="container mx-auto px-4 py-8 sm:px-6">
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

      <EmptyState
        icon={PackageSearch}
        title="No listings yet"
        description="The marketplace search and filter views will be available in WEB-02. Be the first to create an offer or request!"
        action={
          <Button variant="outline" asChild>
            <Link href="/listings/new">Create Listing</Link>
          </Button>
        }
      />
    </div>
  );
}
