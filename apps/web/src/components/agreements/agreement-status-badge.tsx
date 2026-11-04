import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import type { AgreementStatus } from '@market/shared';

interface AgreementStatusBadgeProps {
  status: AgreementStatus;
  className?: string;
}

export function AgreementStatusBadge({ status, className }: AgreementStatusBadgeProps) {
  switch (status) {
    case 'ACTIVE':
      return (
        <Badge variant="default" className={`bg-blue-600 text-white ${className ?? ''}`}>
          Active
        </Badge>
      );
    case 'DELIVERED':
      return (
        <Badge variant="secondary" className={`bg-amber-100 text-amber-800 ${className ?? ''}`}>
          Delivered
        </Badge>
      );
    case 'COMPLETED':
      return (
        <Badge variant="default" className={`bg-emerald-600 text-white ${className ?? ''}`}>
          Completed
        </Badge>
      );
    case 'CANCELLED':
      return (
        <Badge variant="outline" className={`text-muted-foreground ${className ?? ''}`}>
          Cancelled
        </Badge>
      );
    case 'DISPUTED':
      return (
        <Badge variant="destructive" className={className}>
          Disputed
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={className}>
          {status}
        </Badge>
      );
  }
}
