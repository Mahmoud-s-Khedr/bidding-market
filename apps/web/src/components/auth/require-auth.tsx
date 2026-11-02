'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from './auth-provider';
import { Spinner } from '@/components/ui/spinner';

export function useRequireAuthRedirect() {
  const { isAuthenticated, isLoading, isAdmin, user } = useAuth();
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

  return { isAuthenticated, isLoading, isAdmin, user };
}

export interface RequireAuthProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RequireAuth({ children, fallback }: RequireAuthProps) {
  const { isAuthenticated, isLoading } = useRequireAuthRedirect();

  if (isLoading) {
    return (
      fallback || (
        <div className="flex min-h-[50vh] items-center justify-center p-8">
          <Spinner size="lg" label="Checking authentication..." />
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

  return <>{children}</>;
}
