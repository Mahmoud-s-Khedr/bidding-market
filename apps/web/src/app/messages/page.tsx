'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { RequireAuth } from '@/components/auth/require-auth';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { ConversationList } from '@/components/messaging/conversation-list';

export default function MessagesPage() {
  const router = useRouter();

  return (
    <React.Suspense
      fallback={
        <div className="flex justify-center p-12">
          <Spinner size="lg" label="Loading messages..." />
        </div>
      }
    >
      <RequireAuth>
        <div className="container mx-auto px-4 py-4 sm:px-6 h-[calc(100vh-4rem)] max-h-[900px]">
          <div className="h-full border border-border rounded-xl bg-card overflow-hidden shadow-xs flex">
            {/* Left sidebar: Conversation list */}
            <div className="w-full md:w-80 lg:w-96 border-r border-border flex flex-col shrink-0 h-full">
              <div className="p-4 border-b border-border bg-muted/20">
                <h1 className="text-xl font-bold tracking-tight text-foreground">Messages</h1>
              </div>
              <div className="flex-1 overflow-hidden">
                <ConversationList
                  onSelectConversation={(id) => {
                    router.push(`/messages/${id}`);
                  }}
                />
              </div>
            </div>

            {/* Right side: desktop placeholder */}
            <div className="hidden md:flex flex-1 items-center justify-center p-8 bg-muted/10">
              <EmptyState
                icon={MessageSquare}
                title="No Conversation Selected"
                description="Choose a conversation from the list to view messages, share files, and collaborate."
              />
            </div>
          </div>
        </div>
      </RequireAuth>
    </React.Suspense>
  );
}
