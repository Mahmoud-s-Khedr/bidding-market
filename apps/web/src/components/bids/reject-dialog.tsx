'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/ui/form-field';

export interface RejectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason?: string) => Promise<void>;
  isLoading?: boolean;
}

export function RejectDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading = false,
}: RejectDialogProps) {
  const [reason, setReason] = React.useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirm(reason.trim() || undefined);
    setReason('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reject Bid</DialogTitle>
          <DialogDescription>
            Are you sure you want to reject this bid? You can provide an optional reason to explain
            your decision to the bidder.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-4"
        >
          <FormField
            id="reject-reason"
            label="Reason for rejection (optional)"
            hint="Max 2,000 characters."
          >
            <Textarea
              id="reject-reason"
              rows={4}
              maxLength={2000}
              placeholder="e.g. Budget outside expected scope, looking for different specialization..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </FormField>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" isLoading={isLoading}>
              Reject Bid
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
