'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/auth/require-auth';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ListingForm } from '@/components/listings/listing-form';
import { useAuth } from '@/components/auth/auth-provider';
import { useListing, useUpdateListing } from '@/lib/api/listings';
import { useToast } from '@/components/ui/toast';
import type { CreateListingRequest, UpdateListingRequest } from '@/lib/api/types';

function EditListingContent() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const id = (params?.id as string) || '';

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
  const updateMutation = useUpdateListing();

  const isOwner = Boolean(user && listing && user.id === listing.owner.id);
  const isLoading = authLoading || (isListingLoading && !listing);

  const handleSubmit = async (data: CreateListingRequest | UpdateListingRequest) => {
    await updateMutation.mutateAsync({ id, data });
    toast({
      title: 'Listing updated',
      description: 'Your changes have been saved successfully.',
    });
    router.push(`/listings/${id}`);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-16">
        <Spinner size="lg" label="Loading listing details..." />
      </div>
    );
  }

  if (isError || !listing) {
    return (
      <div className="container mx-auto px-4 py-16 sm:px-6 max-w-2xl">
        <ErrorState
          title="Unable to load listing"
          message={error instanceof Error ? error.message : 'Listing could not be retrieved'}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="container mx-auto px-4 py-16 sm:px-6 max-w-md text-center">
        <EmptyState
          title="Access Denied"
          description="You do not have permission to edit this listing because you are not the owner."
          action={
            <Button asChild>
              <Link href={`/listings/${id}`}>Return to Listing</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (listing.status !== 'DRAFT' && listing.status !== 'OPEN') {
    return (
      <div className="container mx-auto px-4 py-16 sm:px-6 max-w-md text-center">
        <EmptyState
          title="Listing Cannot Be Edited"
          description={`Listings in ${listing.status} status cannot be edited.`}
          action={
            <Button asChild>
              <Link href={`/listings/${id}`}>Return to Listing</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 max-w-3xl">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <Link href="/listings" className="hover:text-foreground">
            Listings
          </Link>
          <span>/</span>
          <Link href={`/listings/${id}`} className="hover:text-foreground">
            {listing.title}
          </Link>
          <span>/</span>
          <span className="font-semibold text-foreground">Edit</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Edit Listing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Update the details, pricing, delivery expectations, or media attachments.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 sm:p-8 shadow-xs">
        <ListingForm
          initialListing={listing}
          onSubmit={handleSubmit}
          isLoading={updateMutation.isPending}
        />
      </div>
    </div>
  );
}

export default function EditListingPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex justify-center p-12">
          <Spinner size="lg" label="Loading..." />
        </div>
      }
    >
      <RequireAuth>
        <EditListingContent />
      </RequireAuth>
    </React.Suspense>
  );
}
