import * as React from 'react';
import type { Metadata } from 'next';
import { Shield } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { RequireAdmin } from '@/components/auth/require-admin';
import { Spinner } from '@/components/ui/spinner';

export const metadata: Metadata = {
  title: 'Admin Panel — BidMarket',
  description: 'Platform management, category CRUD, reports queue, and audit logs.',
};

export default function AdminPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex justify-center p-12">
          <Spinner size="lg" label="Loading..." />
        </div>
      }
    >
      <RequireAdmin>
        <div className="container mx-auto px-4 py-8 sm:px-6">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Administration Control Center
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Platform administration, category hierarchy management, and report moderation.
            </p>
          </div>

          <EmptyState
            icon={Shield}
            title="Admin Dashboard"
            description="Platform stats, category tree management, report resolution, and audit logs will be delivered in WEB-06."
          />
        </div>
      </RequireAdmin>
    </React.Suspense>
  );
}
