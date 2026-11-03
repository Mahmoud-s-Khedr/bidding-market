'use client';

import * as React from 'react';
import { ArrowUpDown, Check, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { canBidTransition } from '@/lib/api/bid-types';
import type { Bid } from '@/lib/api/types';

export interface BidActionBarProps {
  bid: Bid;
  listingIsOpen?: boolean;
  isOwner?: boolean;
  onShortlist: (bid: Bid) => void | Promise<void>;
  onCounter: (bid: Bid) => void;
  onReject: (bid: Bid) => void;
  onAccept: (bid: Bid) => void;
  isShortlisting?: boolean;
  layout?: 'table' | 'grid';
  className?: string;
}

export function BidActionBar({
  bid,
  listingIsOpen = true,
  isOwner = true,
  onShortlist,
  onCounter,
  onReject,
  onAccept,
  isShortlisting = false,
  layout = 'table',
  className = '',
}: BidActionBarProps) {
  const canShortlist =
    isOwner && listingIsOpen && canBidTransition(bid.status, 'SHORTLIST', 'owner');
  const canCounter = isOwner && listingIsOpen && canBidTransition(bid.status, 'COUNTER', 'owner');
  const canReject = isOwner && listingIsOpen && canBidTransition(bid.status, 'REJECT', 'owner');
  const canAccept = isOwner && listingIsOpen && canBidTransition(bid.status, 'ACCEPT', 'owner');

  const bidderName = bid.bidder.displayName;

  if (layout === 'grid') {
    return (
      <div
        className={`grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-border ${className}`}
      >
        <Button
          size="sm"
          variant="outline"
          disabled={!canShortlist || isShortlisting}
          onClick={() => void onShortlist(bid)}
        >
          <Sparkles className="h-3.5 w-3.5 mr-1" />
          Shortlist
        </Button>
        <Button size="sm" variant="outline" disabled={!canCounter} onClick={() => onCounter(bid)}>
          <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
          Counter
        </Button>
        <Button size="sm" variant="destructive" disabled={!canReject} onClick={() => onReject(bid)}>
          <X className="h-3.5 w-3.5 mr-1" />
          Reject
        </Button>
        <Button
          size="sm"
          disabled={!canAccept}
          onClick={() => onAccept(bid)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Check className="h-3.5 w-3.5 mr-1" />
          Accept
        </Button>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <Button
        size="sm"
        variant="outline"
        title="Shortlist bid"
        aria-label={`Shortlist ${bidderName}'s bid`}
        disabled={!canShortlist || isShortlisting}
        onClick={() => void onShortlist(bid)}
        className="h-8 px-2 text-xs"
      >
        <Sparkles className="h-3.5 w-3.5 mr-1" />
        Shortlist
      </Button>

      <Button
        size="sm"
        variant="outline"
        title="Counter-offer"
        aria-label={`Counter ${bidderName}'s bid`}
        disabled={!canCounter}
        onClick={() => onCounter(bid)}
        className="h-8 px-2 text-xs"
      >
        <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
        Counter
      </Button>

      <Button
        size="sm"
        variant="destructive"
        title="Reject bid"
        aria-label={`Reject ${bidderName}'s bid`}
        disabled={!canReject}
        onClick={() => onReject(bid)}
        className="h-8 px-2 text-xs"
      >
        <X className="h-3.5 w-3.5 mr-1" />
        Reject
      </Button>

      <Button
        size="sm"
        title="Accept bid"
        aria-label={`Accept ${bidderName}'s bid`}
        disabled={!canAccept}
        onClick={() => onAccept(bid)}
        className="h-8 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
      >
        <Check className="h-3.5 w-3.5 mr-1" />
        Accept
      </Button>
    </div>
  );
}
