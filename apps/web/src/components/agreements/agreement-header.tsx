import * as React from 'react';
import Link from 'next/link';
import { MessageSquare, ExternalLink, UserCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatMoney } from '@/lib/format';
import { safeMediaUrl } from '@/lib/safe-url';
import type { AgreementDetail, AgreementStatus } from '@market/shared';

interface AgreementHeaderProps {
  agreement: AgreementDetail;
  viewerId?: string;
}

export function AgreementHeader({ agreement, viewerId }: AgreementHeaderProps) {
  const isBuyer = agreement.myRole === 'buyer' || agreement.buyer.id === viewerId;
  const isProvider = agreement.myRole === 'provider' || agreement.provider.id === viewerId;

  const agreedPriceCents = agreement.bid?.amountCents ?? 0;
  const currency = agreement.bid?.currency ?? 'USD';

  const getStatusBadge = (status: AgreementStatus) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <Badge variant="default" className="bg-blue-600 text-white text-xs px-2.5 py-0.5">
            Active
          </Badge>
        );
      case 'DELIVERED':
        return (
          <Badge
            variant="secondary"
            className="bg-amber-100 text-amber-900 border-amber-300 text-xs px-2.5 py-0.5"
          >
            Delivered
          </Badge>
        );
      case 'COMPLETED':
        return (
          <Badge variant="default" className="bg-emerald-600 text-white text-xs px-2.5 py-0.5">
            Completed
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge variant="outline" className="text-muted-foreground text-xs px-2.5 py-0.5">
            Cancelled
          </Badge>
        );
      case 'DISPUTED':
        return (
          <Badge variant="destructive" className="text-xs px-2.5 py-0.5">
            Disputed
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((p) => p[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <Card className="p-6 mb-6 shadow-xs border-border/80">
      {/* Top row: Status, Price, Chat button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-border">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Agreement #{agreement.id.slice(0, 8)}
            </span>
            {getStatusBadge(agreement.status)}
            {agreement.myConfirmation && (
              <Badge
                variant="outline"
                className="text-emerald-600 border-emerald-300 gap-1 text-xs"
              >
                <UserCheck className="h-3 w-3" /> You Confirmed Completion
              </Badge>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mt-2 tracking-tight">
            {agreement.listing?.title ?? 'Service Agreement'}
          </h1>

          {agreement.listing && (
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span>Category: {agreement.listing.categoryName}</span>
              <span>•</span>
              <Link
                href={`/listings/${agreement.listing.id}`}
                className="text-primary hover:underline inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs"
              >
                View original listing <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          )}
        </div>

        <div className="flex sm:flex-col items-start sm:items-end justify-between sm:justify-center gap-2 shrink-0">
          <div className="text-right">
            <span className="text-xs text-muted-foreground block">Agreed Price</span>
            <span className="text-2xl font-black text-foreground">
              {formatMoney(agreedPriceCents, currency)}
            </span>
          </div>

          {agreement.conversationId && (
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link href={`/messages/${agreement.conversationId}`}>
                <MessageSquare className="h-4 w-4" />
                Chat with counterpart
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Bottom row: Parties */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-5">
        {/* Buyer card */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border/50">
          <Avatar className="h-11 w-11 shrink-0">
            {agreement.buyer.avatarUrl && (
              <AvatarImage
                src={safeMediaUrl(agreement.buyer.avatarUrl)}
                alt={agreement.buyer.displayName}
              />
            )}
            <AvatarFallback>{getInitials(agreement.buyer.displayName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Buyer</span>
              {isBuyer && (
                <Badge variant="secondary" className="text-[10px] px-1 py-0">
                  You
                </Badge>
              )}
            </div>
            <Link
              href={`/users/${agreement.buyer.id}`}
              className="font-medium text-foreground hover:text-primary transition-colors text-sm truncate block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs"
            >
              {agreement.buyer.displayName}
            </Link>
            <span className="text-xs text-muted-foreground">
              Rating: {agreement.buyer.ratingAvg.toFixed(1)} ★ ({agreement.buyer.ratingCount})
            </span>
          </div>
        </div>

        {/* Provider card */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border/50">
          <Avatar className="h-11 w-11 shrink-0">
            {agreement.provider.avatarUrl && (
              <AvatarImage
                src={safeMediaUrl(agreement.provider.avatarUrl)}
                alt={agreement.provider.displayName}
              />
            )}
            <AvatarFallback>{getInitials(agreement.provider.displayName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase">
                Provider
              </span>
              {isProvider && (
                <Badge variant="secondary" className="text-[10px] px-1 py-0">
                  You
                </Badge>
              )}
            </div>
            <Link
              href={`/users/${agreement.provider.id}`}
              className="font-medium text-foreground hover:text-primary transition-colors text-sm truncate block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs"
            >
              {agreement.provider.displayName}
            </Link>
            <span className="text-xs text-muted-foreground">
              Rating: {agreement.provider.ratingAvg.toFixed(1)} ★ ({agreement.provider.ratingCount})
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
