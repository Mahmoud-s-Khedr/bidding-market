'use client';

import * as React from 'react';
import { Flag } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useAuth } from '@/components/auth/auth-provider';
import { ReportDialog } from './report-dialog';
import type { ReportTargetType } from '@/lib/api/admin-types';

export interface ReportButtonProps extends Omit<ButtonProps, 'onClick'> {
  targetType: ReportTargetType;
  targetId: string;
  targetTitle?: string;
  ownerId?: string | null;
  label?: string;
  hideLabel?: boolean;
}

export function ReportButton({
  targetType,
  targetId,
  targetTitle,
  ownerId,
  label = 'Report',
  hideLabel = false,
  variant = 'ghost',
  size = 'sm',
  className,
  ...props
}: ReportButtonProps) {
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);

  // Visibility rule: do not show report button for own content or yourself
  const isOwnContent = Boolean(user && ownerId && user.id === ownerId);
  const isSelfUser = Boolean(user && targetType === 'USER' && user.id === targetId);

  if (isOwnContent || isSelfUser) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
        aria-label={
          label ? `${label} ${targetType.toLowerCase()}` : `Report ${targetType.toLowerCase()}`
        }
        {...props}
      >
        <Flag className="h-4 w-4 shrink-0 text-muted-foreground hover:text-destructive transition-colors" />
        {!hideLabel && <span className="ml-1.5">{label}</span>}
      </Button>

      {open && (
        <ReportDialog
          open={open}
          onOpenChange={setOpen}
          targetType={targetType}
          targetId={targetId}
          targetTitle={targetTitle}
        />
      )}
    </>
  );
}
