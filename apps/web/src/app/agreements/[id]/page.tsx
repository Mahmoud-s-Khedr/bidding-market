'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { RequireAuth } from '@/components/auth/require-auth';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { AgreementHeader } from '@/components/agreements/agreement-header';
import { AgreementActionsBar } from '@/components/agreements/agreement-actions-bar';
import { AgreementMilestones } from '@/components/agreements/agreement-milestones';
import { AgreementDeliverables } from '@/components/agreements/agreement-deliverables';
import { AgreementReviews } from '@/components/agreements/agreement-reviews';
import { AgreementTimeline } from '@/components/agreements/agreement-timeline';
import { useAgreement } from '@/lib/api/agreements';
import { useAuth } from '@/components/auth/auth-provider';
import { ApiError } from '@/lib/api/client';

export default function AgreementPage() {
  const params = useParams();
  const agreementId = typeof params?.id === 'string' ? params.id : '';
  const { user } = useAuth();

  const {
    data: agreement,
    isLoading,
    error,
    refetch,
  } = useAgreement(agreementId, { viewerId: user?.id, enabled: Boolean(agreementId) });

  return (
    <React.Suspense
      fallback={
        <div className="flex justify-center p-12">
          <Spinner size="lg" label="Loading agreement..." />
        </div>
      }
    >
      <RequireAuth>
        <div className="container mx-auto px-4 py-8 sm:px-6 max-w-5xl">
          {/* Back navigation */}
          <div className="mb-4">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="gap-1.5 -ml-2 text-muted-foreground"
            >
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4" /> Back to Dashboard
              </Link>
            </Button>
          </div>

          {isLoading && (
            <div className="flex justify-center p-16" data-testid="agreement-loading-spinner">
              <Spinner size="lg" label="Loading agreement details..." />
            </div>
          )}

          {!isLoading && error && (
            <div className="py-8">
              {(error instanceof ApiError && error.status === 404) ||
              (typeof error === 'object' &&
                error !== null &&
                'status' in error &&
                (error as { status: number }).status === 404) ? (
                <ErrorState
                  title="Agreement Not Found"
                  message="The requested agreement does not exist or you do not have permission to view it."
                >
                  <Button asChild size="sm">
                    <Link href="/dashboard">Return to Dashboard</Link>
                  </Button>
                </ErrorState>
              ) : (error instanceof ApiError && error.status === 403) ||
                (typeof error === 'object' &&
                  error !== null &&
                  'status' in error &&
                  (error as { status: number }).status === 403) ? (
                <ErrorState
                  title="Access Restricted"
                  message="Only participating buyers and providers are authorized to view this transaction."
                >
                  <Button asChild size="sm">
                    <Link href="/dashboard">Return to Dashboard</Link>
                  </Button>
                </ErrorState>
              ) : (
                <ErrorState
                  title="Failed to load agreement"
                  message="Could not load the agreement details. Please try again."
                  onRetry={() => {
                    void refetch();
                  }}
                />
              )}
            </div>
          )}

          {!isLoading && agreement && (
            <div className="space-y-6">
              {/* Header details */}
              <AgreementHeader agreement={agreement} viewerId={user?.id} />

              {/* Action bar for Complete / Cancel / Dispute */}
              <AgreementActionsBar
                agreement={agreement}
                viewerId={user?.id}
                onRefetch={() => {
                  void refetch();
                }}
              />

              {/* Milestones tracking */}
              <AgreementMilestones
                agreement={agreement}
                viewerId={user?.id}
                onRefetch={() => {
                  void refetch();
                }}
              />

              {/* Deliverables exchange */}
              <AgreementDeliverables
                agreement={agreement}
                viewerId={user?.id}
                onRefetch={() => {
                  void refetch();
                }}
              />

              {/* Reviews section (shown when completed) */}
              <AgreementReviews
                agreement={agreement}
                viewerId={user?.id}
                onRefetch={() => {
                  void refetch();
                }}
              />

              {/* Audit history timeline */}
              <AgreementTimeline agreement={agreement} />
            </div>
          )}
        </div>
      </RequireAuth>
    </React.Suspense>
  );
}
