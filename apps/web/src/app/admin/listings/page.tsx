'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowUpRight, FileText, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { useAdminListings, useRemoveAdminListing, useRestoreAdminListing } from '@/lib/api/admin';
import { formatDate } from '@/lib/format';
import { ApiError } from '@/lib/api/client';
import type { AdminListingItem, ListingStatus } from '@/lib/api/admin-types';

export default function AdminListingsPage() {
  const [searchInput, setSearchInput] = React.useState('');
  const [debouncedQ, setDebouncedQ] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<ListingStatus | 'ALL'>('ALL');

  // Pagination Cursor Stack
  const [cursor, setCursor] = React.useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = React.useState<string[]>([]);

  // Action Dialog (Remove or Restore)
  const [actionListing, setActionListing] = React.useState<{
    item: AdminListingItem;
    type: 'remove' | 'restore';
  } | null>(null);
  const [reason, setReason] = React.useState('');
  const [dialogError, setDialogError] = React.useState<string | null>(null);

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(searchInput.trim());
      setCursor(undefined);
      setCursorHistory([]);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const queryParams = React.useMemo(
    () => ({
      q: debouncedQ || undefined,
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      cursor,
      limit: 15,
    }),
    [debouncedQ, statusFilter, cursor],
  );

  const { data, isLoading, isError, error, refetch, isFetching } = useAdminListings(queryParams);
  const removeListingMutation = useRemoveAdminListing();
  const restoreListingMutation = useRestoreAdminListing();

  const handleOpenAction = (item: AdminListingItem, type: 'remove' | 'restore') => {
    setActionListing({ item, type });
    setReason('');
    setDialogError(null);
  };

  const handleCloseActionDialog = () => {
    setActionListing(null);
    setReason('');
    setDialogError(null);
  };

  const handleSubmitAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionListing) return;
    if (!reason.trim()) {
      setDialogError('A justification reason is required for the audit trail.');
      return;
    }

    setDialogError(null);

    try {
      if (actionListing.type === 'remove') {
        await removeListingMutation.mutateAsync({
          id: actionListing.item.id,
          reason: reason.trim(),
        });
        toast.success(
          'Listing removed',
          `Listing "${actionListing.item.title}" has been taken down. Active bids have been declined.`,
        );
      } else {
        await restoreListingMutation.mutateAsync({
          id: actionListing.item.id,
          reason: reason.trim(),
        });
        toast.success(
          'Listing restored',
          `Listing "${actionListing.item.title}" was restored to its previous status.`,
        );
      }
      handleCloseActionDialog();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setDialogError(
            actionListing.type === 'remove'
              ? 'Listing is already removed.'
              : 'Listing is not in removed status.',
          );
          toast.error('Action conflict', err.message);
          return;
        }
        setDialogError(err.message || 'Action failed');
        toast.error('Failed', err.message);
      } else {
        const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
        setDialogError(msg);
        toast.error('Error', msg);
      }
    }
  };

  const handleNextPage = () => {
    if (data?.nextCursor) {
      setCursorHistory((prev) => [...prev, cursor || '']);
      setCursor(data.nextCursor);
    }
  };

  const handlePrevPage = () => {
    if (cursorHistory.length > 0) {
      const prevCursor = cursorHistory[cursorHistory.length - 1];
      setCursorHistory((prev) => prev.slice(0, -1));
      setCursor(prevCursor || undefined);
    }
  };

  const getStatusBadge = (status: ListingStatus) => {
    switch (status) {
      case 'OPEN':
        return (
          <Badge variant="secondary" className="text-[10px] text-emerald-600 bg-emerald-500/10">
            OPEN
          </Badge>
        );
      case 'IN_PROGRESS':
        return (
          <Badge variant="secondary" className="text-[10px] text-blue-600 bg-blue-500/10">
            IN PROGRESS
          </Badge>
        );
      case 'COMPLETED':
        return (
          <Badge variant="secondary" className="text-[10px] text-purple-600 bg-purple-500/10">
            COMPLETED
          </Badge>
        );
      case 'CLOSED':
        return (
          <Badge variant="outline" className="text-[10px]">
            CLOSED
          </Badge>
        );
      case 'DRAFT':
        return (
          <Badge variant="outline" className="text-[10px] opacity-70">
            DRAFT
          </Badge>
        );
      case 'REMOVED':
        return (
          <Badge variant="destructive" className="text-[10px]">
            REMOVED
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-[10px]">
            {status}
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Listings Moderation
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Review all marketplace postings across all lifecycle statuses, enforce compliance, and
          take down violations.
        </p>
      </div>

      {/* Filters and Search Bar */}
      <Card className="p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-center">
          {/* Search Query */}
          <div className="relative lg:col-span-3">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search listings by title or description..."
              className="pl-9 pr-8 text-xs"
              aria-label="Search listings by title or description"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div>
            <Select
              value={statusFilter}
              onValueChange={(val) => {
                setStatusFilter(val as ListingStatus | 'ALL');
                setCursor(undefined);
                setCursorHistory([]);
              }}
            >
              <SelectTrigger className="w-full text-xs" aria-label="Filter by listing status">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CLOSED">Closed</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="REMOVED">Removed by Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Main Table */}
      <Card className="shadow-xs overflow-hidden">
        {isLoading ? (
          <div
            className="p-6 space-y-4"
            aria-busy="true"
            aria-label="Loading listings moderation list"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b border-border/50"
              >
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-64" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <div className="flex gap-4 items-center">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-8 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="p-8">
            <ErrorState
              title="Failed to Load Listings"
              message={
                error instanceof Error
                  ? error.message
                  : 'Could not retrieve listings for moderation.'
              }
              retryLabel="Retry"
              onRetry={() => void refetch()}
            />
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-12">
            <EmptyState
              icon={FileText}
              title="No Listings Found"
              description="No marketplace listings match your current search and status filter."
              action={
                searchInput || statusFilter !== 'ALL' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchInput('');
                      setStatusFilter('ALL');
                    }}
                  >
                    Clear Filters
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left" aria-label="Listings moderation table">
              <thead className="bg-muted/70 text-muted-foreground font-semibold border-b border-border">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Listing Title
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Type
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Owner
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Created
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((item) => {
                  const isRemoved = item.status === 'REMOVED';

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-muted/30 transition-colors"
                      data-testid={`listing-row-${item.id}`}
                    >
                      {/* Title & Preview Link */}
                      <td className="px-4 py-3.5 max-w-sm">
                        <div className="flex flex-col">
                          <Link
                            href={`/listings/${item.id}`}
                            className="font-semibold text-foreground hover:text-primary hover:underline truncate inline-flex items-center gap-1"
                            title={item.title}
                          >
                            <span>{item.title}</span>
                            <ArrowUpRight className="h-3 w-3 shrink-0 opacity-60" />
                          </Link>
                          {isRemoved && item.removedReason && (
                            <span className="text-[11px] text-destructive truncate">
                              Reason: {item.removedReason}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Kind */}
                      <td className="px-4 py-3.5">
                        <Badge variant="outline" className="text-[10px]">
                          {item.kind}
                        </Badge>
                      </td>

                      {/* Owner */}
                      <td className="px-4 py-3.5">
                        <Link
                          href={`/users/${item.owner.id}`}
                          className="text-foreground hover:underline truncate max-w-[150px] inline-block font-medium"
                        >
                          {item.owner.displayName}
                        </Link>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">{getStatusBadge(item.status)}</td>

                      {/* Created */}
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {formatDate(item.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isRemoved ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenAction(item, 'restore')}
                              className="text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                              aria-label={`Restore listing ${item.title}`}
                            >
                              <RotateCcw className="h-3.5 w-3.5 mr-1" />
                              Restore
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenAction(item, 'remove')}
                              className="text-xs text-destructive hover:bg-destructive/10"
                              aria-label={`Remove listing ${item.title}`}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              Remove
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {data && data.items.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20 text-xs">
            <span className="text-muted-foreground">
              Showing <strong className="text-foreground">{data.items.length}</strong> listings
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevPage}
                disabled={cursorHistory.length === 0 || isFetching}
                className="text-xs"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={!data.nextCursor || isFetching}
                className="text-xs"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Remove / Restore Dialog */}
      {actionListing && (
        <Dialog
          open={Boolean(actionListing)}
          onOpenChange={(open) => !open && handleCloseActionDialog()}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {actionListing.type === 'remove' ? (
                  <>
                    <Trash2 className="h-5 w-5 text-destructive" />
                    Remove Marketplace Listing
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-5 w-5 text-emerald-600" />
                    Restore Listing
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                {actionListing.type === 'remove'
                  ? `Taking down "${actionListing.item.title}". Any pending bids on this listing will automatically be declined.`
                  : `Restoring "${actionListing.item.title}" back to its previous status.`}
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                void handleSubmitAction(e);
              }}
              className="space-y-4 pt-2"
            >
              {dialogError && (
                <div
                  className="rounded-md bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2"
                  role="alert"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{dialogError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="listing-action-reason">
                    Reason for {actionListing.type === 'remove' ? 'takedown' : 'restoration'} *
                  </Label>
                  <span className="text-[11px] text-muted-foreground">{reason.length} / 2000</span>
                </div>
                <Textarea
                  id="listing-action-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value.slice(0, 2000))}
                  placeholder={
                    actionListing.type === 'remove'
                      ? 'State the reason for content removal (e.g. prohibited goods, spam, copyright violation)...'
                      : 'State the justification for restoring this content...'
                  }
                  rows={3}
                  className="text-xs resize-none"
                  required
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseActionDialog}
                  disabled={removeListingMutation.isPending || restoreListingMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant={actionListing.type === 'remove' ? 'destructive' : 'primary'}
                  isLoading={removeListingMutation.isPending || restoreListingMutation.isPending}
                  disabled={removeListingMutation.isPending || restoreListingMutation.isPending}
                >
                  {actionListing.type === 'remove' ? 'Confirm Removal' : 'Confirm Restoration'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
