import * as React from 'react';
import type { Metadata } from 'next';
import { LayoutDashboard } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { RequireAuth } from '@/components/auth/require-auth';
import { Spinner } from '@/components/ui/spinner';

export const metadata: Metadata = {
  title: 'Dashboard — BidMarket',
  description: 'Manage your active listings, bids, conversations, and agreements.',
};

export default function DashboardPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex justify-center p-12">
          <Spinner size="lg" label="Loading..." />
        </div>
      }
    >
      <RequireAuth>
        <div className="container mx-auto px-4 py-8 sm:px-6">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">User Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track your ongoing negotiations, active agreements, and marketplace activity.
            </p>
          </div>

          <EmptyState
            icon={LayoutDashboard}
            title="Dashboard Overview"
            description="Your summary metrics, active listings, incoming bids, and milestone statuses will be displayed here in WEB-05."
          />
        </div>
      </RequireAuth>
    </React.Suspense>
  );
}
