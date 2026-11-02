import * as React from 'react';
import type { Metadata } from 'next';
import { MessageSquare } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { RequireAuth } from '@/components/auth/require-auth';
import { Spinner } from '@/components/ui/spinner';

export const metadata: Metadata = {
  title: 'Messages — BidMarket',
  description: 'Your real-time conversations and agreement discussions.',
};

export default function MessagesPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex justify-center p-12">
          <Spinner size="lg" label="Loading..." />
        </div>
      }
    >
      <RequireAuth>
        <div className="container mx-auto px-4 py-8 sm:px-6">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Conversations</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Direct communication, attachments, and voice notes with buyers and providers.
            </p>
          </div>

          <EmptyState
            icon={MessageSquare}
            title="No Conversations Selected"
            description="Real-time WebSocket chat, typing indicators, read receipts, and voice note recording will be delivered in WEB-04."
          />
        </div>
      </RequireAuth>
    </React.Suspense>
  );
}
