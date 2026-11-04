'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  Gavel,
  MessageSquare,
  ShieldAlert,
  User,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { useAdminReports, useResolveAdminReport } from '@/lib/api/admin';
import { formatDate, formatMoney } from '@/lib/format';
import { ApiError } from '@/lib/api/client';
import type {
  AdminReportItem,
  ReportReason,
  ReportResolution,
  ReportStatus,
  ReportTargetType,
} from '@/lib/api/admin-types';

export function getDisabledResolutionReason(
  targetType: ReportTargetType,
  action: ReportResolution,
): string | null {
  if (action === 'REMOVE_CONTENT') {
    if (targetType === 'USER') return 'Content removal is not applicable to user accounts';
    if (targetType === 'AGREEMENT') return 'Content removal is not applicable to agreements';
  }
  if (action === 'SUSPEND_USER') {
    if (targetType === 'AGREEMENT') return 'User suspension is not applicable to agreements';
  }
  return null;
}

const RESOLUTION_DESCRIPTIONS: Record<ReportResolution, string> = {
  DISMISS: 'Dismiss report without modifying content or penalizing user (e.g. false alarm).',
  REMOVE_CONTENT: 'Takedown and remove the reported listing, bid, or message from the platform.',
  SUSPEND_USER:
    'Suspend the user account responsible for this content and revoke active login sessions.',
};

export default function AdminReportsPage() {
  const [statusFilter, setStatusFilter] = React.useState<ReportStatus>('OPEN');

  // Pagination Cursor Stack
  const [cursor, setCursor] = React.useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = React.useState<string[]>([]);

  // Resolve Dialog State
  const [resolvingReport, setResolvingReport] = React.useState<AdminReportItem | null>(null);
  const [selectedAction, setSelectedAction] = React.useState<ReportResolution>('DISMISS');
  const [resolutionNote, setResolutionNote] = React.useState('');
  const [dialogError, setDialogError] = React.useState<string | null>(null);

  const queryParams = React.useMemo(
    () => ({
      status: statusFilter,
      cursor,
      limit: 15,
    }),
    [statusFilter, cursor],
  );

  const { data, isLoading, isError, error, refetch, isFetching } = useAdminReports(queryParams);
  const resolveReportMutation = useResolveAdminReport();

  const handleOpenResolveDialog = (report: AdminReportItem) => {
    setResolvingReport(report);
    setSelectedAction('DISMISS');
    setResolutionNote('');
    setDialogError(null);
  };

  const handleCloseDialog = () => {
    setResolvingReport(null);
    setResolutionNote('');
    setDialogError(null);
  };

  const handleSubmitResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingReport) return;
    if (!resolutionNote.trim()) {
      setDialogError('A resolution note is required for moderation records.');
      return;
    }

    const actionDisabledReason = getDisabledResolutionReason(
      resolvingReport.targetType,
      selectedAction,
    );
    if (actionDisabledReason) {
      setDialogError(actionDisabledReason);
      return;
    }

    setDialogError(null);

    try {
      await resolveReportMutation.mutateAsync({
        id: resolvingReport.id,
        input: {
          action: selectedAction,
          note: resolutionNote.trim(),
        },
      });

      toast.success(
        'Report resolved',
        `Report against ${resolvingReport.targetType.toLowerCase()} marked as ${selectedAction}.`,
      );
      handleCloseDialog();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          toast.error(
            'Conflict',
            err.message || 'This report or target has already been modified.',
          );
          handleCloseDialog();
          void refetch();
          return;
        }
        if (err.status === 404) {
          toast.error('Not found', err.message || 'Report or target not found.');
          handleCloseDialog();
          void refetch();
          return;
        }
        if (err.status === 400) {
          setDialogError(err.message || 'Invalid resolution action for this target type.');
          toast.error('Invalid action', err.message);
          return;
        }
        setDialogError(err.message || 'Failed to resolve report.');
        toast.error('Resolution failed', err.message);
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

  const renderTargetPreview = (report: AdminReportItem) => {
    const target = report.target;
    switch (report.targetType) {
      case 'LISTING': {
        const title = target && 'title' in target ? target.title : null;
        return (
          <div className="flex flex-col">
            <Link
              href={`/listings/${report.targetId}`}
              className="text-foreground hover:text-primary hover:underline font-medium inline-flex items-center gap-1"
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate max-w-[200px]">
                {title || `Listing #${report.targetId.slice(-6)}`}
              </span>
              <ArrowUpRight className="h-3 w-3 shrink-0 opacity-60" />
            </Link>
          </div>
        );
      }
      case 'USER': {
        const displayName = target && 'displayName' in target ? target.displayName : null;
        return (
          <Link
            href={`/users/${report.targetId}`}
            className="text-foreground hover:text-primary hover:underline font-medium inline-flex items-center gap-1"
          >
            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate max-w-[200px]">
              {displayName || `User #${report.targetId.slice(-6)}`}
            </span>
            <ArrowUpRight className="h-3 w-3 shrink-0 opacity-60" />
          </Link>
        );
      }
      case 'MESSAGE': {
        const body = target && 'body' in target ? target.body : null;
        return (
          <div className="text-muted-foreground flex items-center gap-1 text-[11px] max-w-[200px] truncate">
            <MessageSquare className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate italic">&ldquo;{body || 'Message content'}&rdquo;</span>
          </div>
        );
      }
      case 'BID': {
        const amountCents = target && 'amountCents' in target ? target.amountCents : null;
        return (
          <div className="text-foreground font-medium flex items-center gap-1">
            <Gavel className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span>
              {typeof amountCents === 'number'
                ? formatMoney(amountCents)
                : `Bid #${report.targetId.slice(-6)}`}
            </span>
          </div>
        );
      }
      default:
        return (
          <span className="text-muted-foreground font-mono text-[11px]">
            {report.targetType} #{report.targetId.slice(-6)}
          </span>
        );
    }
  };

  const getReasonBadge = (reason: ReportReason) => {
    switch (reason) {
      case 'SPAM':
        return (
          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
            SPAM
          </Badge>
        );
      case 'FRAUD':
        return (
          <Badge variant="destructive" className="text-[10px]">
            FRAUD
          </Badge>
        );
      case 'HARASSMENT':
        return (
          <Badge variant="destructive" className="text-[10px]">
            HARASSMENT
          </Badge>
        );
      case 'INAPPROPRIATE':
        return (
          <Badge variant="secondary" className="text-[10px] text-purple-600 bg-purple-500/10">
            INAPPROPRIATE
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-[10px]">
            OTHER
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-primary" />
          Reports Moderation Queue
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Process community reports, investigate fraudulent or abusive activities, and apply
          resolution actions.
        </p>
      </div>

      {/* Filter Tabs */}
      <Card className="p-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className="flex items-center gap-2"
            role="group"
            aria-label="Filter reports by status"
          >
            {(['OPEN', 'RESOLVED', 'DISMISSED'] as const).map((status) => {
              const active = statusFilter === status;
              return (
                <Button
                  key={status}
                  type="button"
                  variant={active ? 'primary' : 'outline'}
                  size="sm"
                  aria-pressed={active}
                  onClick={() => {
                    setStatusFilter(status);
                    setCursor(undefined);
                    setCursorHistory([]);
                  }}
                  className="text-xs"
                >
                  {status === 'OPEN' && 'Open Queue'}
                  {status === 'RESOLVED' && 'Resolved'}
                  {status === 'DISMISSED' && 'Dismissed'}
                </Button>
              );
            })}
          </div>

          <span className="text-[11px] text-muted-foreground">
            Filter: <strong>{statusFilter}</strong>
          </span>
        </div>
      </Card>

      {/* Main Table */}
      <Card className="shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4" aria-busy="true" aria-label="Loading reports list">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b border-border/50"
              >
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-72" />
                </div>
                <div className="flex gap-4 items-center">
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-8 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="p-8">
            <ErrorState
              title="Failed to Load Reports"
              message={
                error instanceof Error ? error.message : 'Could not retrieve moderation queue.'
              }
              retryLabel="Retry"
              onRetry={() => void refetch()}
            />
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-12">
            <EmptyState
              icon={CheckCircle2}
              title={
                statusFilter === 'OPEN'
                  ? 'Reports Queue is Clean'
                  : `No ${statusFilter.toLowerCase()} reports`
              }
              description={
                statusFilter === 'OPEN'
                  ? 'All submitted user reports have been reviewed and acted upon.'
                  : `There are currently no reports marked as ${statusFilter.toLowerCase()}.`
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left" aria-label="Moderation reports table">
              <thead className="bg-muted/70 text-muted-foreground font-semibold border-b border-border">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Reported Item
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Reason
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Reporter
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Details
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Submitted
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    {statusFilter === 'OPEN' ? 'Action' : 'Resolution'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-muted/30 transition-colors"
                    data-testid={`report-row-${item.id}`}
                  >
                    {/* Target Item */}
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className="w-fit text-[9px] font-mono">
                          {item.targetType}
                        </Badge>
                        {renderTargetPreview(item)}
                      </div>
                    </td>

                    {/* Reason */}
                    <td className="px-4 py-3.5">{getReasonBadge(item.reason)}</td>

                    {/* Reporter */}
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground">
                          {item.reporter.displayName}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {item.reporter.email}
                        </span>
                      </div>
                    </td>

                    {/* Details */}
                    <td className="px-4 py-3.5 max-w-xs text-muted-foreground">
                      <p className="line-clamp-2" title={item.details || 'No details provided'}>
                        {item.details || '—'}
                      </p>
                    </td>

                    {/* Submitted Date */}
                    <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">
                      {formatDate(item.createdAt)}
                    </td>

                    {/* Action or Outcome */}
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      {item.status === 'OPEN' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenResolveDialog(item)}
                          className="text-xs"
                          aria-label={`Resolve report for ${item.targetType.toLowerCase()}`}
                        >
                          Resolve Report
                        </Button>
                      ) : (
                        <div className="flex flex-col items-end">
                          <Badge
                            variant={item.resolution === 'DISMISS' ? 'secondary' : 'destructive'}
                            className="text-[10px]"
                          >
                            {item.resolution || item.status}
                          </Badge>
                          {item.resolutionNote && (
                            <span
                              className="text-[10px] text-muted-foreground max-w-[140px] truncate mt-0.5"
                              title={item.resolutionNote}
                            >
                              Note: {item.resolutionNote}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {data && data.items.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20 text-xs">
            <span className="text-muted-foreground">
              Showing <strong className="text-foreground">{data.items.length}</strong> reports
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

      {/* Resolve Dialog */}
      {resolvingReport && (
        <Dialog
          open={Boolean(resolvingReport)}
          onOpenChange={(open) => !open && handleCloseDialog()}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Gavel className="h-5 w-5 text-primary" />
                Resolve Report #{resolvingReport.id.slice(-6)}
              </DialogTitle>
              <DialogDescription>
                Determine moderation outcome against reported{' '}
                <strong>{resolvingReport.targetType.toLowerCase()}</strong> for reason{' '}
                <strong>{resolvingReport.reason}</strong>.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                void handleSubmitResolve(e);
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

              {/* Action selection */}
              <div className="space-y-1.5">
                <Label htmlFor="resolve-action-select">Moderation Action</Label>
                <Select
                  value={selectedAction}
                  onValueChange={(val) => setSelectedAction(val as ReportResolution)}
                >
                  <SelectTrigger id="resolve-action-select" className="w-full text-xs">
                    <SelectValue placeholder="Select moderation action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DISMISS">DISMISS — Dismiss without action</SelectItem>
                    <SelectItem
                      value="REMOVE_CONTENT"
                      disabled={Boolean(
                        getDisabledResolutionReason(resolvingReport.targetType, 'REMOVE_CONTENT'),
                      )}
                    >
                      REMOVE_CONTENT — Takedown content
                      {getDisabledResolutionReason(resolvingReport.targetType, 'REMOVE_CONTENT')
                        ? ` (${getDisabledResolutionReason(resolvingReport.targetType, 'REMOVE_CONTENT')})`
                        : ''}
                    </SelectItem>
                    <SelectItem
                      value="SUSPEND_USER"
                      disabled={Boolean(
                        getDisabledResolutionReason(resolvingReport.targetType, 'SUSPEND_USER'),
                      )}
                    >
                      SUSPEND_USER — Suspend responsible user
                      {getDisabledResolutionReason(resolvingReport.targetType, 'SUSPEND_USER')
                        ? ` (${getDisabledResolutionReason(resolvingReport.targetType, 'SUSPEND_USER')})`
                        : ''}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {RESOLUTION_DESCRIPTIONS[selectedAction]}
                </p>
                {(getDisabledResolutionReason(resolvingReport.targetType, 'REMOVE_CONTENT') ||
                  getDisabledResolutionReason(resolvingReport.targetType, 'SUSPEND_USER')) && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    {[
                      getDisabledResolutionReason(resolvingReport.targetType, 'REMOVE_CONTENT'),
                      getDisabledResolutionReason(resolvingReport.targetType, 'SUSPEND_USER'),
                    ]
                      .filter(Boolean)
                      .map((r) => `Note: ${r}.`)
                      .join(' ')}
                  </p>
                )}
              </div>

              {/* Required Note */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="resolve-note-input">Resolution Note *</Label>
                  <span className="text-[11px] text-muted-foreground">
                    {resolutionNote.length} / 2000
                  </span>
                </div>
                <Textarea
                  id="resolve-note-input"
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value.slice(0, 2000))}
                  placeholder="Explain the findings and justification for this moderation decision..."
                  rows={3}
                  className="text-xs resize-none"
                  required
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseDialog}
                  disabled={resolveReportMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant={selectedAction === 'DISMISS' ? 'primary' : 'destructive'}
                  isLoading={resolveReportMutation.isPending}
                  disabled={resolveReportMutation.isPending}
                >
                  Confirm Resolution
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
