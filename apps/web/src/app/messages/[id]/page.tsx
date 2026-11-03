'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/auth/require-auth';
import { Spinner } from '@/components/ui/spinner';
import { ConversationList } from '@/components/messaging/conversation-list';
import { ChatView } from '@/components/messaging/chat-view';

export default function ConversationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const conversationId = params?.id;

  if (!conversationId) return null;

  return (
    <React.Suspense
      fallback={
        <div className="flex justify-center p-12">
          <Spinner size="lg" label="Loading conversation..." />
        </div>
      }
    >
      <RequireAuth>
        <div className="container mx-auto px-4 py-4 sm:px-6 h-[calc(100vh-4rem)] max-h-[900px]">
          <div className="h-full border border-border rounded-xl bg-card overflow-hidden shadow-xs flex">
            {/* Left sidebar: hidden on mobile when viewing a conversation, visible on desktop */}
            <div className="hidden md:flex md:w-80 lg:w-96 border-r border-border flex-col shrink-0 h-full">
              <div className="p-4 border-b border-border bg-muted/20">
                <h1 className="text-xl font-bold tracking-tight text-foreground">Messages</h1>
              </div>
              <div className="flex-1 overflow-hidden">
                <ConversationList
                  activeId={conversationId}
                  onSelectConversation={(id) => {
                    router.push(`/messages/${id}`);
                  }}
                />
              </div>
            </div>

            {/* Right side: Chat view (full width on mobile) */}
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              <ChatView conversationId={conversationId} onBack={() => router.push('/messages')} />
            </div>
          </div>
        </div>
      </RequireAuth>
    </React.Suspense>
  );
}
