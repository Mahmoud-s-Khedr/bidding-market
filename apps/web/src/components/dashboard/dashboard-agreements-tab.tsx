import * as React from 'react';
import Link from 'next/link';
import { Handshake, ArrowRight, RefreshCw, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { formatMoney, formatDate } from '@/lib/format';
import { useInfiniteAgreements } from '@/lib/api/agreements';
import { useAuth } from '@/components/auth/auth-provider';
import type { AgreementStatus, AgreementSummary } from '@market/shared';

const STATUS_FILTERS: Array<{ label: string; value: string }> = [
  { label: 'All Statuses', value: 'ALL' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Delivered', value: 'DELIVERED' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Cancelled', value: 'CANCELLED' },
  { label: 'Disputed', value: 'DISPUTED' },
];

const ROLE_FILTERS: Array<{ label: string; value: 'all' | 'buyer' | 'provider' }> = [
  { label: 'All Roles', value: 'all' },
  { label: 'As Buyer', value: 'buyer' },
  { label: 'As Provider', value: 'provider' },
];

export function DashboardAgreementsTab() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');
  const [roleFilter, setRoleFilter] = React.useState<'all' | 'buyer' | 'provider'>('all');

  const queryParams = React.useMemo(() => {
    return {
      ...(statusFilter !== 'ALL' && { status: statusFilter as AgreementStatus }),
      ...(roleFilter !== 'all' && { role: roleFilter }),
    };
  }, [statusFilter, roleFilter]);

  const { data, isLoading, error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteAgreements(queryParams, { viewerId: user?.id });

  const agreements: AgreementSummary[] = React.useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.items);
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="agreements-skeleton">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-4 flex items-center justify-between">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-1/4" />
            </div>
            <Skeleton className="h-8 w-24" />
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to load agreements"
        message="Could not load your agreements. Please try again."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const getStatusBadge = (status: AgreementStatus) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <Badge variant="default" className="bg-blue-600 text-white">
            Active
          </Badge>
        );
      case 'DELIVERED':
        return (
          <Badge variant="secondary" className="bg-amber-100 text-amber-800">
            Delivered
          </Badge>
        );
      case 'COMPLETED':
        return (
          <Badge variant="default" className="bg-emerald-600 text-white">
            Completed
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge variant="outline" className="text-muted-foreground">
            Cancelled
          </Badge>
        );
      case 'DISPUTED':
        return <Badge variant="destructive">Disputed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            My Agreements ({agreements.length})
          </h2>
        </div>

        {/* Dual filter row: Role + Status */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Role selector */}
          <div
            className="flex items-center gap-1 bg-muted p-1 rounded-lg w-fit"
            role="radiogroup"
            aria-label="Filter by role"
          >
            {ROLE_FILTERS.map((r) => (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={roleFilter === r.value}
                onClick={() => setRoleFilter(r.value)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  roleFilter === r.value
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Status selector */}
          <div
            className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0"
            role="group"
            aria-label="Filter agreements by status"
          >
            {STATUS_FILTERS.map((f) => (
              <Button
                key={f.value}
                type="button"
                variant={statusFilter === f.value ? 'primary' : 'outline'}
                size="sm"
                className="text-xs h-7 px-2.5 rounded-full"
                onClick={() => setStatusFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {agreements.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title="No agreements found"
          description={
            statusFilter === 'ALL' && roleFilter === 'all'
              ? 'You do not have any active or completed agreements. When an offer or bid is accepted, an agreement is created here.'
              : 'No agreements matching your current filter criteria.'
          }
          action={
            <Button asChild size="sm">
              <Link href="/listings">Explore marketplace</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {agreements.map((item) => {
            const isBuyer = item.myRole === 'buyer' || item.buyer.id === user?.id;
            const otherParty = isBuyer ? item.provider : item.buyer;
            const otherRoleLabel = isBuyer ? 'Provider' : 'Buyer';
            const priceCents = item.bid?.amountCents ?? 0;
            const currency = item.bid?.currency ?? 'USD';

            return (
              <Card
                key={item.id}
                className="p-4 hover:border-border/80 transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    {getStatusBadge(item.status)}
                    <Badge variant="outline" className="text-[10px]">
                      {isBuyer ? 'You are Buyer' : 'You are Provider'}
                    </Badge>
                    {item.myConfirmation && (
                      <span className="text-[11px] text-emerald-600 font-medium inline-flex items-center gap-1">
                        <UserCheck className="h-3 w-3" /> Confirmed
                      </span>
                    )}
                  </div>

                  <Link
                    href={`/agreements/${item.id}`}
                    className="font-semibold text-foreground hover:text-primary transition-colors text-base line-clamp-1 block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs"
                  >
                    {item.listing?.title ?? 'Listing Agreement'}
                  </Link>

                  <div className="flex items-center gap-2.5 mt-2 text-xs text-muted-foreground flex-wrap">
                    <span className="font-bold text-foreground text-sm">
                      {formatMoney(priceCents, currency)}
                    </span>
                    <span>•</span>
                    <span>
                      {otherRoleLabel}:{' '}
                      <span className="font-medium text-foreground">{otherParty.displayName}</span>
                    </span>
                    <span>•</span>
                    <span>
                      {item.milestones?.length ?? 0} milestone
                      {(item.milestones?.length ?? 0) === 1 ? '' : 's'}
                    </span>
                    <span>•</span>
                    <span>Created {formatDate(item.createdAt)}</span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <Button asChild size="sm">
                    <Link href={`/agreements/${item.id}`}>
                      View Agreement <ArrowRight className="h-4 w-4 ml-1" />
                    </Link>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void fetchNextPage();
            }}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Loading more...
              </>
            ) : (
              'Load more agreements'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
