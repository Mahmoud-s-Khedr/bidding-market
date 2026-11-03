import * as React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useCompleteAgreement,
  useCancelAgreement,
  useDisputeAgreement,
} from '@/lib/api/agreements';
import { ApiError } from '@/lib/api/client';
import type { AgreementDetail } from '@market/shared';

interface AgreementActionsBarProps {
  agreement: AgreementDetail;
  viewerId?: string;
  onRefetch?: () => void;
}

export function AgreementActionsBar({ agreement, viewerId, onRefetch }: AgreementActionsBarProps) {
  const completeMutation = useCompleteAgreement(agreement.id, { viewerId });
  const cancelMutation = useCancelAgreement(agreement.id, { viewerId });
  const disputeMutation = useDisputeAgreement(agreement.id, { viewerId });

  // Dialog states
  const [completeDialogOpen, setCompleteDialogOpen] = React.useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false);
  const [disputeDialogOpen, setDisputeDialogOpen] = React.useState(false);

  // Form reasons
  const [cancelReason, setCancelReason] = React.useState('');
  const [disputeReason, setDisputeReason] = React.useState('');
  const [cancelError, setCancelError] = React.useState<string | null>(null);
  const [disputeError, setDisputeError] = React.useState<string | null>(null);

  const isActionable = agreement.status === 'ACTIVE' || agreement.status === 'DELIVERED';

  const mapErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof ApiError) {
      if (error.status === 409) {
        return error.message || 'Agreement state has changed or conflict occurred. Please refresh.';
      }
      if (error.status === 403) {
        return error.message || 'You do not have permission to perform this action.';
      }
      return error.message || fallback;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return fallback;
  };

  const handleComplete = async () => {
    try {
      await completeMutation.mutateAsync();
      toast.success(
        'Confirmation recorded',
        'Your confirmation has been saved. Once both parties confirm, the agreement completes.',
      );
      setCompleteDialogOpen(false);
      onRefetch?.();
    } catch (err) {
      const msg = mapErrorMessage(err, 'Failed to complete agreement');
      toast.error('Could not complete agreement', msg);
      onRefetch?.();
    }
  };

  const handleCancel = async () => {
    const trimmed = cancelReason.trim();
    if (!trimmed) {
      setCancelError('Please provide a reason for cancelling this agreement.');
      return;
    }
    if (trimmed.length > 2000) {
      setCancelError('Reason cannot exceed 2000 characters.');
      return;
    }

    try {
      await cancelMutation.mutateAsync({ reason: trimmed });
      toast.success('Agreement cancelled', 'The agreement has been cancelled.');
      setCancelDialogOpen(false);
      setCancelReason('');
      setCancelError(null);
      onRefetch?.();
    } catch (err) {
      const msg = mapErrorMessage(err, 'Failed to cancel agreement');
      toast.error('Could not cancel agreement', msg);
      onRefetch?.();
    }
  };

  const handleDispute = async () => {
    const trimmed = disputeReason.trim();
    if (!trimmed) {
      setDisputeError('Please provide a reason for raising a dispute.');
      return;
    }
    if (trimmed.length > 2000) {
      setDisputeError('Reason cannot exceed 2000 characters.');
      return;
    }

    try {
      await disputeMutation.mutateAsync({ reason: trimmed });
      toast.success(
        'Dispute submitted',
        'Your dispute has been logged. Our administration team will review it.',
      );
      setDisputeDialogOpen(false);
      setDisputeReason('');
      setDisputeError(null);
      onRefetch?.();
    } catch (err) {
      const msg = mapErrorMessage(err, 'Failed to dispute agreement');
      toast.error('Could not raise dispute', msg);
      onRefetch?.();
    }
  };

  if (!isActionable) {
    if (agreement.status === 'COMPLETED') {
      return (
        <Card className="p-4 mb-6 bg-emerald-50 border-emerald-200 text-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <p className="font-semibold text-sm">Agreement Completed</p>
              <p className="text-xs text-emerald-700">
                Both parties have fulfilled and confirmed the terms. Don&apos;t forget to leave a
                review below!
              </p>
            </div>
          </div>
        </Card>
      );
    }
    if (agreement.status === 'CANCELLED') {
      return (
        <Card className="p-4 mb-6 bg-muted/60 border-border text-muted-foreground">
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="font-semibold text-sm text-foreground">Agreement Cancelled</p>
              <p className="text-xs">This agreement has been terminated.</p>
            </div>
          </div>
        </Card>
      );
    }
    if (agreement.status === 'DISPUTED') {
      return (
        <Card className="p-4 mb-6 bg-destructive/10 border-destructive/30 text-destructive">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="font-semibold text-sm">Agreement in Dispute</p>
              <p className="text-xs">
                This transaction has been disputed and is pending platform moderation review.
              </p>
            </div>
          </div>
        </Card>
      );
    }
    return null;
  }

  return (
    <>
      <Card className="p-4 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-background border-border shadow-xs">
        <div>
          <span className="text-sm font-semibold text-foreground block">Agreement Actions</span>
          {agreement.myConfirmation ? (
            <p className="text-xs text-emerald-600 font-medium flex items-center gap-1.5 mt-0.5">
              <Clock className="h-3.5 w-3.5" />
              You confirmed completion. Waiting for the other party to confirm.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">
              Mark complete when work is satisfactory, or cancel/dispute if issues cannot be
              resolved.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {agreement.myConfirmation ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled
              className="text-emerald-600 border-emerald-300"
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Waiting for counterpart
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setCompleteDialogOpen(true)}
              disabled={completeMutation.isPending}
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Mark Complete
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setCancelReason('');
              setCancelError(null);
              setCancelDialogOpen(true);
            }}
            disabled={cancelMutation.isPending}
          >
            <XCircle className="h-4 w-4 mr-1.5" />
            Cancel
          </Button>

          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              setDisputeReason('');
              setDisputeError(null);
              setDisputeDialogOpen(true);
            }}
            disabled={disputeMutation.isPending}
          >
            <AlertTriangle className="h-4 w-4 mr-1.5" />
            Dispute
          </Button>
        </div>
      </Card>

      {/* Complete Dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Completion</DialogTitle>
            <DialogDescription>
              Are you sure you want to mark this agreement as completed? Both parties must confirm
              completion to finalize the transaction.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCompleteDialogOpen(false)}
              disabled={completeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                void handleComplete();
              }}
              isLoading={completeMutation.isPending}
            >
              Yes, Mark Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Agreement</DialogTitle>
            <DialogDescription>
              Cancelling will close this transaction and associated listing. Please provide a clear
              reason for the records.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <Label htmlFor="cancel-reason">Reason for cancellation (required)</Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => {
                setCancelReason(e.target.value);
                setCancelError(null);
              }}
              placeholder="Explain why you are cancelling this agreement..."
              rows={3}
              className={cancelError ? 'border-destructive' : ''}
            />
            {cancelError && <p className="text-xs text-destructive">{cancelError}</p>}
          </div>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelDialogOpen(false)}
              disabled={cancelMutation.isPending}
            >
              Dismiss
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                void handleCancel();
              }}
              isLoading={cancelMutation.isPending}
            >
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispute Dialog */}
      <Dialog open={disputeDialogOpen} onOpenChange={setDisputeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Raise a Dispute</DialogTitle>
            <DialogDescription>
              A dispute escalates this agreement to platform administrators for investigation and
              mediation. Please detail the issue clearly.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <Label htmlFor="dispute-reason">Dispute details & reason (required)</Label>
            <Textarea
              id="dispute-reason"
              value={disputeReason}
              onChange={(e) => {
                setDisputeReason(e.target.value);
                setDisputeError(null);
              }}
              placeholder="Describe the discrepancy, non-delivery, or dispute..."
              rows={4}
              className={disputeError ? 'border-destructive' : ''}
            />
            {disputeError && <p className="text-xs text-destructive">{disputeError}</p>}
          </div>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDisputeDialogOpen(false)}
              disabled={disputeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                void handleDispute();
              }}
              isLoading={disputeMutation.isPending}
            >
              Submit Dispute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
