import * as React from 'react';
import {
  Clock,
  CheckCircle2,
  Package,
  RotateCcw,
  PlusCircle,
  XCircle,
  AlertTriangle,
  FileCheck,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatDate, formatRelativeTime } from '@/lib/format';
import type { AgreementDetail, AgreementEvent } from '@market/shared';

interface AgreementTimelineProps {
  agreement: AgreementDetail;
}

export function AgreementTimeline({ agreement }: AgreementTimelineProps) {
  const events: AgreementEvent[] = agreement.events ?? [];

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'CREATED':
        return <PlusCircle className="h-4 w-4 text-primary" />;
      case 'MILESTONE_CREATED':
      case 'MILESTONE_UPDATED':
        return <FileCheck className="h-4 w-4 text-blue-500" />;
      case 'DELIVERABLE_SUBMITTED':
        return <Package className="h-4 w-4 text-amber-500" />;
      case 'DELIVERABLE_ACCEPTED':
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'REVISION_REQUESTED':
        return <RotateCcw className="h-4 w-4 text-amber-600" />;
      case 'COMPLETED':
        return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
      case 'CANCELLED':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'DISPUTED':
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getEventTitle = (type: string) => {
    switch (type) {
      case 'CREATED':
        return 'Agreement Created';
      case 'MILESTONE_CREATED':
        return 'Milestone Added';
      case 'MILESTONE_UPDATED':
        return 'Milestone Updated';
      case 'DELIVERABLE_SUBMITTED':
        return 'Deliverable Submitted';
      case 'DELIVERABLE_ACCEPTED':
        return 'Deliverable Accepted';
      case 'REVISION_REQUESTED':
        return 'Revision Requested';
      case 'COMPLETED':
        return 'Agreement Completed';
      case 'CANCELLED':
        return 'Agreement Cancelled';
      case 'DISPUTED':
        return 'Dispute Raised';
      case 'STATUS_CHANGED':
        return 'Status Changed';
      default:
        return type.replace(/_/g, ' ');
    }
  };

  const getActorLabel = (actorId: string | null) => {
    if (!actorId) return 'System';
    if (actorId === agreement.buyer.id) return agreement.buyer.displayName;
    if (actorId === agreement.provider.id) return agreement.provider.displayName;
    return 'User';
  };

  return (
    <Card className="p-6 shadow-xs border-border/80">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-foreground">Activity Timeline</h2>
        <p className="text-xs text-muted-foreground">
          Audit history and key milestones in this transaction.
        </p>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-border rounded-lg text-muted-foreground text-xs">
          No activity recorded yet.
        </div>
      ) : (
        <div className="relative pl-6 space-y-5 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
          {events.map((ev) => {
            const dataObj =
              ev.data && typeof ev.data === 'object' ? (ev.data as Record<string, unknown>) : null;

            return (
              <div key={ev.id} className="relative group">
                {/* Timeline node icon */}
                <div className="absolute -left-6 mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background ring-4 ring-background">
                  {getEventIcon(ev.type)}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {getEventTitle(ev.type)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(ev.createdAt)} ({formatDate(ev.createdAt)})
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Action by{' '}
                    <span className="font-medium text-foreground">{getActorLabel(ev.actorId)}</span>
                  </p>

                  {/* Optional event details */}
                  {Boolean(dataObj && typeof dataObj.reason === 'string') && (
                    <div className="mt-1.5 p-2 rounded-md bg-muted/40 text-xs text-foreground">
                      <span className="font-medium">Reason: </span>
                      {String(dataObj?.reason)}
                    </div>
                  )}

                  {Boolean(dataObj && typeof dataObj.note === 'string') && (
                    <div className="mt-1.5 p-2 rounded-md bg-muted/40 text-xs text-foreground">
                      <span className="font-medium">Note: </span>
                      {String(dataObj?.note)}
                    </div>
                  )}

                  {Boolean(dataObj && typeof dataObj.title === 'string') && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      &quot;{String(dataObj?.title)}&quot;
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
