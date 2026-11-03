import * as React from 'react';
import Link from 'next/link';
import { FileText, Gavel, Handshake, MessageSquare, Bell, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { useDashboardSummary } from '@/lib/api/dashboard';
import { useAuth } from '@/components/auth/auth-provider';

interface DashboardSummaryCardsProps {
  onSelectTab?: (tab: 'listings' | 'bids' | 'conversations' | 'agreements') => void;
}

export function DashboardSummaryCards({ onSelectTab }: DashboardSummaryCardsProps) {
  const { user } = useAuth();
  const { data: summary, isLoading, error, refetch } = useDashboardSummary({ viewerId: user?.id });

  if (isLoading) {
    return (
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        data-testid="dashboard-summary-skeleton"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-4 w-24 mb-3" />
            <Skeleton className="h-8 w-16 mb-2" />
            <Skeleton className="h-3 w-32" />
          </Card>
        ))}
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="mb-8">
        <ErrorState
          title="Failed to load dashboard metrics"
          message="Could not load your activity summary. Please check your connection and retry."
          onRetry={() => {
            void refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {/* Listings summary */}
      <Card
        className="cursor-pointer hover:border-primary/50 transition-colors shadow-xs"
        onClick={() => onSelectTab?.('listings')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectTab?.('listings');
          }
        }}
        aria-label="View My Listings"
      >
        <CardContent className="p-5">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-sm font-medium">My Listings</span>
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground mb-1">
            {summary.listings.open + summary.listings.inProgress + summary.listings.completed}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-emerald-600 font-medium">{`${summary.listings.open} open`}</span>
            <span>•</span>
            <span>{`${summary.listings.inProgress} active`}</span>
            <span>•</span>
            <span>{`${summary.listings.completed} closed`}</span>
          </div>
        </CardContent>
      </Card>

      {/* Bids summary */}
      <Card
        className="cursor-pointer hover:border-primary/50 transition-colors shadow-xs"
        onClick={() => onSelectTab?.('bids')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectTab?.('bids');
          }
        }}
        aria-label="View My Bids"
      >
        <CardContent className="p-5">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-sm font-medium">My Bids</span>
            <Gavel className="h-4 w-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground mb-1">
            {summary.bids.pending + summary.bids.accepted}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-amber-600 font-medium">{`${summary.bids.pending} pending`}</span>
            <span>•</span>
            <span className="text-emerald-600 font-medium">{`${summary.bids.accepted} accepted`}</span>
          </div>
        </CardContent>
      </Card>

      {/* Agreements summary */}
      <Card
        className="cursor-pointer hover:border-primary/50 transition-colors shadow-xs"
        onClick={() => onSelectTab?.('agreements')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectTab?.('agreements');
          }
        }}
        aria-label="View My Agreements"
      >
        <CardContent className="p-5">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-sm font-medium">Agreements</span>
            <Handshake className="h-4 w-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground mb-1">
            {summary.agreements.active + summary.agreements.completed}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-blue-600 font-medium">{`${summary.agreements.active} active`}</span>
            <span>•</span>
            <span className="text-muted-foreground">{`${summary.agreements.completed} completed`}</span>
          </div>
        </CardContent>
      </Card>

      {/* Inbox & Alerts */}
      <Card className="p-5 flex flex-col justify-between shadow-xs">
        <div>
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-sm font-medium">Inbox & Alerts</span>
            <div className="flex items-center gap-1.5 text-primary">
              <MessageSquare className="h-4 w-4" />
              <Bell className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-3 mb-1">
            <Link
              href="/messages"
              className="text-2xl font-bold text-foreground hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs"
              aria-label={`${summary.unreadMessages} unread messages`}
            >
              {summary.unreadMessages}{' '}
              <span className="text-xs font-normal text-muted-foreground">unread msg</span>
            </Link>
          </div>
          <div className="text-xs text-muted-foreground">
            <Link
              href="/notifications"
              className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs"
              aria-label={`${summary.unreadNotifications} notifications`}
            >
              {summary.unreadNotifications} unread notification
              {summary.unreadNotifications === 1 ? '' : 's'}
            </Link>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => onSelectTab?.('conversations')}
            className="text-primary hover:underline font-medium inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs"
          >
            Recent chats <ArrowRight className="h-3 w-3" />
          </button>
          <Link
            href="/notifications"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs"
          >
            All alerts
          </Link>
        </div>
      </Card>
    </div>
  );
}
