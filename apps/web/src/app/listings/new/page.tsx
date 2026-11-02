import * as React from 'react';
import type { Metadata } from 'next';
import { PlusCircle } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { RequireAuth } from '@/components/auth/require-auth';
import { Spinner } from '@/components/ui/spinner';

export const metadata: Metadata = {
  title: 'Post a Listing — BidMarket',
  description: 'Create a new request or offer on BidMarket.',
};

export default function NewListingPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex justify-center p-12">
          <Spinner size="lg" label="Loading..." />
        </div>
      }
    >
      <RequireAuth>
        <div className="container mx-auto px-4 py-8 sm:px-6 max-w-4xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Create a New Listing
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Publish a service/product request or an offer with delivery and pricing terms.
            </p>
          </div>

          <EmptyState
            icon={PlusCircle}
            title="Listing Creation Form"
            description="The complete listing creation form with category tree selection and media uploads will be provided in WEB-02."
          />
        </div>
      </RequireAuth>
    </React.Suspense>
  );
}
