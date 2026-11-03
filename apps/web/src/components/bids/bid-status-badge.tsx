import * as React from 'react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import type { BidStatus } from '@/lib/api/types';

const statusConfig: Record<BidStatus, { label: string; variant: BadgeVariant }> = {
  PENDING: { label: 'Pending', variant: 'warning' },
  SHORTLISTED: { label: 'Shortlisted', variant: 'secondary' },
  COUNTERED: { label: 'Countered', variant: 'default' },
  ACCEPTED: { label: 'Accepted', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'destructive' },
  WITHDRAWN: { label: 'Withdrawn', variant: 'outline' },
  DECLINED: { label: 'Declined', variant: 'outline' },
};

export interface BidStatusBadgeProps {
  status: BidStatus;
  className?: string;
}

export function BidStatusBadge({ status, className }: BidStatusBadgeProps) {
  const config = statusConfig[status] ?? { label: status, variant: 'outline' };
  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
}
