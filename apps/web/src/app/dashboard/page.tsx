'use client';

import * as React from 'react';
import { RequireAuth } from '@/components/auth/require-auth';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DashboardSummaryCards } from '@/components/dashboard/dashboard-summary-cards';
import { DashboardListingsTab } from '@/components/dashboard/dashboard-listings-tab';
import { DashboardBidsTab } from '@/components/dashboard/dashboard-bids-tab';
import { DashboardConversationsTab } from '@/components/dashboard/dashboard-conversations-tab';
import { DashboardAgreementsTab } from '@/components/dashboard/dashboard-agreements-tab';
import { FileText, Gavel, Handshake, MessageSquare } from 'lucide-react';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = React.useState<
    'listings' | 'bids' | 'conversations' | 'agreements'
  >('listings');

  return (
    <React.Suspense
      fallback={
        <div className="flex justify-center p-12">
          <Spinner size="lg" label="Loading dashboard..." />
        </div>
      }
    >
      <RequireAuth>
        <div className="container mx-auto px-4 py-8 sm:px-6 max-w-6xl">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your active listings, ongoing bids, agreements, and conversations.
            </p>
          </div>

          {/* Metric cards */}
          <DashboardSummaryCards onSelectTab={(tab) => setActiveTab(tab)} />

          {/* Tabbed views */}
          <Tabs
            value={activeTab}
            onValueChange={(val) =>
              setActiveTab(val as 'listings' | 'bids' | 'conversations' | 'agreements')
            }
            className="space-y-6"
          >
            <TabsList className="grid grid-cols-2 sm:grid-cols-4 h-auto p-1 gap-1">
              <TabsTrigger value="listings" className="flex items-center gap-2 py-2">
                <FileText className="h-4 w-4" />
                <span>My Listings</span>
              </TabsTrigger>
              <TabsTrigger value="bids" className="flex items-center gap-2 py-2">
                <Gavel className="h-4 w-4" />
                <span>My Bids</span>
              </TabsTrigger>
              <TabsTrigger value="conversations" className="flex items-center gap-2 py-2">
                <MessageSquare className="h-4 w-4" />
                <span>Conversations</span>
              </TabsTrigger>
              <TabsTrigger value="agreements" className="flex items-center gap-2 py-2">
                <Handshake className="h-4 w-4" />
                <span>Agreements</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="listings" className="pt-2">
              <DashboardListingsTab />
            </TabsContent>

            <TabsContent value="bids" className="pt-2">
              <DashboardBidsTab />
            </TabsContent>

            <TabsContent value="conversations" className="pt-2">
              <DashboardConversationsTab />
            </TabsContent>

            <TabsContent value="agreements" className="pt-2">
              <DashboardAgreementsTab />
            </TabsContent>
          </Tabs>
        </div>
      </RequireAuth>
    </React.Suspense>
  );
}
