'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from './auth-provider';
import { Spinner } from '@/components/ui/spinner';
import { ErrorState } from '@/components/ui/error-state';

export interface RequireAdminProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RequireAdmin({ children, fallback }: RequireAdminProps) {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const qs = searchParams?.toString();
      const currentUrl = qs ? `${pathname}?${qs}` : pathname;
      router.replace(`/login?next=${encodeURIComponent(currentUrl || '/')}`);
    }
  }, [isLoading, isAuthenticated, router, pathname, searchParams]);

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
    return null;
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
