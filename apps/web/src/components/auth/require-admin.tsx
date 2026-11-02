'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuthRedirect } from './require-auth';
import { Spinner } from '@/components/ui/spinner';
import { ErrorState } from '@/components/ui/error-state';

export interface RequireAdminProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RequireAdmin({ children, fallback }: RequireAdminProps) {
  const { isAuthenticated, isAdmin, isLoading } = useRequireAuthRedirect();
  const router = useRouter();

  if (isLoading) {
    return (
      fallback || (
        <div className="flex min-h-[50vh] items-center justify-center p-8">
          <Spinner size="lg" label="Checking authorization..." />
        </div>
      )
    );
  }

  if (!isAuthenticated) {
    return (
      fallback || (
        <div className="flex min-h-[50vh] items-center justify-center p-8">
          <Spinner size="lg" label="Redirecting to login..." />
        </div>
      )
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-12">
        <ErrorState
          title="Access Denied"
          message="You do not have permission to access the administration panel. This section is restricted to administrators."
          retryLabel="Back to Home"
          onRetry={() => router.push('/')}
        />
      </div>
    );
  }

  return <>{children}</>;
}
