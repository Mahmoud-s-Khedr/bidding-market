'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import { useAcceptBid, useCounterBid, useRejectBid, useShortlistBid } from '@/lib/api/bids';
import { ApiError } from '@/lib/api/client';
import type { Bid, BidCounterInput } from '@/lib/api/types';

export interface UseBidActionsOptions {
  onSuccess?: () => void;
  refetch?: () => Promise<unknown> | void;
}

export function useBidActions(options?: UseBidActionsOptions) {
  const router = useRouter();
  const { toast } = useToast();

  const [selectedBid, setSelectedBid] = React.useState<Bid | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = React.useState(false);
  const [counterDialogOpen, setCounterDialogOpen] = React.useState(false);
  const [acceptDialogOpen, setAcceptDialogOpen] = React.useState(false);

  const shortlistMutation = useShortlistBid();
  const rejectMutation = useRejectBid();
  const counterMutation = useCounterBid();
  const acceptMutation = useAcceptBid();

  const closeAllDialogs = React.useCallback(() => {
    setRejectDialogOpen(false);
    setCounterDialogOpen(false);
    setAcceptDialogOpen(false);
  }, []);

  const handleConflictError = React.useCallback(
    async (err: unknown) => {
      if (err instanceof ApiError && err.status === 409) {
        closeAllDialogs();
        toast({
          title: 'Action Conflict',
          description: 'This bid changed, refresh.',
          variant: 'error',
        });
        if (options?.refetch) {
          await options.refetch();
        }
      } else {
        const msg = err instanceof Error ? err.message : 'Action failed';
        toast({
          title: 'Error',
          description: msg,
          variant: 'error',
        });
      }
    },
    [closeAllDialogs, options, toast],
  );

  const openCounter = React.useCallback((bid: Bid) => {
    setSelectedBid(bid);
    setCounterDialogOpen(true);
  }, []);

  const openReject = React.useCallback((bid: Bid) => {
    setSelectedBid(bid);
    setRejectDialogOpen(true);
  }, []);

  const openAccept = React.useCallback((bid: Bid) => {
    setSelectedBid(bid);
    setAcceptDialogOpen(true);
  }, []);

  const handleShortlist = React.useCallback(
    async (bid: Bid) => {
      try {
        await shortlistMutation.mutateAsync(bid.id);
        toast({
          title: 'Bid shortlisted',
          description: `${bid.bidder.displayName}'s bid has been shortlisted.`,
        });
        options?.onSuccess?.();
      } catch (err) {
        await handleConflictError(err);
      }
    },
    [handleConflictError, options, shortlistMutation, toast],
  );

  const handleConfirmReject = React.useCallback(
    async (reason?: string) => {
      if (!selectedBid) return;
      try {
        await rejectMutation.mutateAsync({
          id: selectedBid.id,
          data: { reason },
        });
        setRejectDialogOpen(false);
        toast({
          title: 'Bid rejected',
          description: `${selectedBid.bidder.displayName}'s bid was rejected.`,
        });
        options?.onSuccess?.();
      } catch (err) {
        await handleConflictError(err);
      }
    },
    [handleConflictError, options, rejectMutation, selectedBid, toast],
  );

  const handleConfirmCounter = React.useCallback(
    async (payload: BidCounterInput) => {
      if (!selectedBid) return;
      try {
        await counterMutation.mutateAsync({
          id: selectedBid.id,
          data: payload,
        });
        setCounterDialogOpen(false);
        toast({
          title: 'Counter-offer sent',
          description: 'Your counter-offer has been sent to the bidder.',
        });
        options?.onSuccess?.();
      } catch (err) {
        await handleConflictError(err);
      }
    },
    [counterMutation, handleConflictError, options, selectedBid, toast],
  );

  const handleConfirmAccept = React.useCallback(async () => {
    if (!selectedBid) return;
    try {
      const res = await acceptMutation.mutateAsync(selectedBid.id);
      setAcceptDialogOpen(false);
      toast({
        title: 'Bid Accepted!',
        description: 'Agreement created. Other active bids have been declined.',
        variant: 'default',
      });
      options?.onSuccess?.();
      if (res?.agreement?.id) {
        router.push(`/agreements/${res.agreement.id}`);
      }
    } catch (err) {
      await handleConflictError(err);
    }
  }, [acceptMutation, handleConflictError, options, router, selectedBid, toast]);

  return {
    selectedBid,
    setSelectedBid,
    rejectDialogOpen,
    setRejectDialogOpen,
    counterDialogOpen,
    setCounterDialogOpen,
    acceptDialogOpen,
    setAcceptDialogOpen,
    closeAllDialogs,
    openCounter,
    openReject,
    openAccept,
    handleShortlist,
    handleConfirmReject,
    handleConfirmCounter,
    handleConfirmAccept,
    isShortlisting: shortlistMutation.isPending,
    isRejecting: rejectMutation.isPending,
    isCountering: counterMutation.isPending,
    isAccepting: acceptMutation.isPending,
  };
}
