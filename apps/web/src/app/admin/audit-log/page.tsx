'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight, ClipboardList, History } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useAdminAuditLog } from '@/lib/api/admin';
import { formatDate } from '@/lib/format';

export default function AdminAuditLogPage() {
  const [cursor, setCursor] = React.useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = React.useState<string[]>([]);
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set());

  const queryParams = React.useMemo(
    () => ({
      cursor,
      limit: 15,
    }),
    [cursor],
  );

  const { data, isLoading, isError, error, refetch, isFetching } = useAdminAuditLog(queryParams);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
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

  const getActionBadge = (action: string) => {
    if (action.includes('REMOVE') || action.includes('BAN') || action.includes('DELETE')) {
      return (
        <Badge variant="destructive" className="text-[10px]">
          {action}
        </Badge>
      );
    }
    if (action.includes('RESTORE') || action.includes('RESOLVED')) {
      return (
        <Badge variant="secondary" className="text-[10px] text-emerald-600 bg-emerald-500/10">
          {action}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[10px]">
        {action}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          Administrative Audit Log
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Immutable chronological ledger of all moderation decisions, category edits, and governance
          updates.
        </p>
      </div>

      {/* Main Table */}
      <Card className="shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4" aria-busy="true" aria-label="Loading audit log">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b border-border/50"
              >
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-72" />
                </div>
                <div className="flex gap-4 items-center">
                  <Skeleton className="h-6 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="p-8">
            <ErrorState
              title="Failed to Load Audit Log"
              message={
                error instanceof Error
                  ? error.message
                  : 'Could not retrieve administrator audit records.'
              }
              retryLabel="Retry"
              onRetry={() => void refetch()}
            />
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-12">
            <EmptyState
              icon={ClipboardList}
              title="Audit Log is Empty"
              description="No administrative actions or moderation decisions have been recorded yet."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left" aria-label="Admin audit log table">
              <thead className="bg-muted/70 text-muted-foreground font-semibold border-b border-border">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Timestamp
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Action
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Target
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Actor ID
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((item) => {
                  const isExpanded = expandedRows.has(item.id);
                  const hasData = Boolean(
                    item.data && typeof item.data === 'object' && Object.keys(item.data).length > 0,
                  );

                  return (
                    <React.Fragment key={item.id}>
                      <tr
                        className="hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => hasData && toggleRow(item.id)}
                        data-testid={`audit-row-${item.id}`}
                      >
                        {/* Timestamp */}
                        <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">
                          {formatDate(item.createdAt)}
                        </td>

                        {/* Action */}
                        <td className="px-4 py-3.5 font-medium text-foreground">
                          {getActionBadge(item.action)}
                        </td>

                        {/* Target */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5 font-mono text-[11px]">
                            <span className="font-semibold text-foreground">{item.targetType}</span>
                            {item.targetId && (
                              <span className="text-muted-foreground">
                                #{item.targetId.slice(-6)}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Actor ID */}
                        <td className="px-4 py-3.5 font-mono text-[11px] text-muted-foreground">
                          {item.actorId ? `actor_${item.actorId.slice(-6)}` : 'System'}
                        </td>

                        {/* Expand Details */}
                        <td className="px-4 py-3.5 text-right">
                          {hasData ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleRow(item.id);
                              }}
                              aria-expanded={isExpanded}
                              aria-label={`Toggle payload details for ${item.action}`}
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronDown className="h-3.5 w-3.5 mr-1" />
                                  Hide
                                </>
                              ) : (
                                <>
                                  <ChevronRight className="h-3.5 w-3.5 mr-1" />
                                  View
                                </>
                              )}
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">—</span>
                          )}
                        </td>
                      </tr>

                      {/* Collapsible JSON payload */}
                      {isExpanded && hasData && (
                        <tr className="bg-muted/40">
                          <td colSpan={5} className="px-4 py-3">
                            <div className="rounded-md bg-background/80 border border-border p-3 font-mono text-[11px] overflow-x-auto text-foreground">
                              <pre>{JSON.stringify(item.data, null, 2)}</pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
              Showing <strong className="text-foreground">{data.items.length}</strong> audit records
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
    </div>
  );
}
