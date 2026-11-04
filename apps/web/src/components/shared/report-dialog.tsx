'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Flag, LogIn } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/components/auth/auth-provider';
import { useSubmitReport } from '@/lib/api/admin';
import { ApiError } from '@/lib/api/client';
import type { ReportReason, ReportTargetType } from '@/lib/api/admin-types';

export interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: ReportTargetType;
  targetId: string;
  targetTitle?: string;
  onSuccess?: () => void;
}

const REASON_LABELS: Record<ReportReason, string> = {
  SPAM: 'Spam or commercial advertising',
  FRAUD: 'Scam, fraud, or deceptive activity',
  INAPPROPRIATE: 'Inappropriate or offensive content',
  HARASSMENT: 'Harassment or hate speech',
  OTHER: 'Other policy violation',
};

export function ReportDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
  targetTitle,
  onSuccess,
}: ReportDialogProps) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [reason, setReason] = React.useState<ReportReason>('SPAM');
  const [details, setDetails] = React.useState('');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const submitReportMutation = useSubmitReport();

  const navigateToLogin = () => {
    const nextPath = typeof window !== 'undefined' ? window.location.pathname : '/';
    const targetUrl = `/login?next=${encodeURIComponent(nextPath)}`;
    router.push(targetUrl);
    onOpenChange(false);
  };

  // Reset form when dialog opens
  React.useEffect(() => {
    if (open) {
      setReason('SPAM');
      setDetails('');
      setErrorMsg(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }

    setErrorMsg(null);

    try {
      await submitReportMutation.mutateAsync({
        targetType,
        targetId,
        reason,
        details: details.trim() ? details.trim() : undefined,
      });

      toast.success(
        'Report submitted',
        'Thank you for helping keep our community safe. Our moderation team has received your report.',
      );
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setErrorMsg(
            'An open report already exists for this item. Our team is already reviewing it.',
          );
          toast.error('Report already submitted', 'An open report already exists for this item.');
          return;
        }
        if (err.status === 400) {
          setErrorMsg(err.message || 'You cannot report your own content.');
          toast.error('Unable to submit report', err.message || 'Invalid report submission.');
          return;
        }
        setErrorMsg(err.message || 'Failed to submit report');
        toast.error('Error submitting report', err.message);
      } else {
        const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
        setErrorMsg(msg);
        toast.error('Error', msg);
      }
    }
  };

  const formattedTargetType = targetType.charAt(0) + targetType.slice(1).toLowerCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Flag className="h-4 w-4" />
            </div>
            <DialogTitle>Report {formattedTargetType}</DialogTitle>
          </div>
          <DialogDescription>
            {targetTitle
              ? `Report "${targetTitle}" for review by marketplace moderators.`
              : `Help us understand the issue with this ${formattedTargetType.toLowerCase()}.`}
          </DialogDescription>
        </DialogHeader>

        {!isAuthenticated ? (
          <div className="py-6 text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              You must be logged in to submit a report against marketplace content or users.
            </p>
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                onOpenChange(false);
                navigateToLogin();
              }}
            >
              <LogIn className="h-4 w-4 mr-2" />
              Sign in to Report
            </Button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              void handleSubmit(e);
            }}
            className="space-y-4 pt-2"
          >
            {errorMsg && (
              <div
                className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                role="alert"
              >
                {errorMsg}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="report-reason">Reason for report</Label>
              <Select value={reason} onValueChange={(val) => setReason(val as ReportReason)}>
                <SelectTrigger id="report-reason" className="w-full">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SPAM">{REASON_LABELS.SPAM}</SelectItem>
                  <SelectItem value="FRAUD">{REASON_LABELS.FRAUD}</SelectItem>
                  <SelectItem value="INAPPROPRIATE">{REASON_LABELS.INAPPROPRIATE}</SelectItem>
                  <SelectItem value="HARASSMENT">{REASON_LABELS.HARASSMENT}</SelectItem>
                  <SelectItem value="OTHER">{REASON_LABELS.OTHER}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="report-details">Additional details (optional)</Label>
                <span className="text-[11px] text-muted-foreground">{details.length} / 2000</span>
              </div>
              <Textarea
                id="report-details"
                value={details}
                onChange={(e) => setDetails(e.target.value.slice(0, 2000))}
                placeholder="Provide any relevant context or links that can assist our moderators..."
                rows={4}
                className="resize-none text-sm"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitReportMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                isLoading={submitReportMutation.isPending}
                disabled={submitReportMutation.isPending}
              >
                Submit Report
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
