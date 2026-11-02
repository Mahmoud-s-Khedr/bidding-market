'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/auth/require-auth';
import { Spinner } from '@/components/ui/spinner';
import { ListingForm } from '@/components/listings/listing-form';
import { useCreateListing } from '@/lib/api/listings';
import { useToast } from '@/components/ui/toast';
import type { CreateListingRequest } from '@/lib/api/types';

function NewListingContent() {
  const router = useRouter();
  const { toast } = useToast();
  const createMutation = useCreateListing();

  const handleSubmit = async (data: CreateListingRequest) => {
    const created = await createMutation.mutateAsync(data);
    toast({
      title: data.status === 'DRAFT' ? 'Draft saved' : 'Listing published',
      description:
        data.status === 'DRAFT'
          ? 'Your listing has been saved as a draft.'
          : 'Your listing is now live on the marketplace!',
    });
    router.push(`/listings/${created.id}`);
  };

  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Create a New Listing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Publish a service/product request or an offer with delivery and pricing terms.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 sm:p-8 shadow-xs">
        <ListingForm onSubmit={handleSubmit} isLoading={createMutation.isPending} />
      </div>
    </div>
  );
}

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
        <NewListingContent />
      </RequireAuth>
    </React.Suspense>
  );
}
