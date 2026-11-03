// TEMP: replace with @market/shared after API-04 merges
import { z } from 'zod';
import type { Attachment, PublicUser } from './types';

export const MessageType = z.enum(['TEXT', 'IMAGE', 'FILE', 'VOICE']);
export type MessageType = z.infer<typeof MessageType>;

export const NotificationType = z.enum([
  'BID_RECEIVED',
  'BID_UPDATED',
  'BID_COUNTERED',
  'BID_ACCEPTED',
  'BID_REJECTED',
  'MESSAGE_RECEIVED',
  'DELIVERABLE_SUBMITTED',
  'DELIVERABLE_ACCEPTED',
  'REVISION_REQUESTED',
  'AGREEMENT_COMPLETED',
  'AGREEMENT_CANCELLED',
  'REPORT_RESOLVED',
  'REVIEW_RECEIVED',
]);
export type NotificationType = z.infer<typeof NotificationType>;

export interface Message {
  id: string;
  conversationId: string;
  sender: PublicUser;
  type: MessageType;
  body: string | null;
  voiceDurationSec: number | null;
  attachments: Attachment[];
  createdAt: Date | string;
}

export interface Conversation {
  id: string;
  listingId: string | null;
  bidId: string | null;
  agreementId: string | null;
  participants: PublicUser[];
  otherParticipant?: PublicUser;
  lastMessage: Message | null;
  unreadCount?: number;
  listing?: {
    id: string;
    title: string;
    status: string;
  } | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  data?: unknown;
  readAt: Date | string | null;
  createdAt: Date | string;
}

export interface MessageCreateInput {
  type: MessageType;
  body?: string;
  attachmentIds?: string[];
  voiceDurationSec?: number;
}

export interface ConversationCreateInput {
  recipientId: string;
  listingId?: string;
  bidId?: string;
}

export interface MessagesQueryInput {
  cursor?: string;
  limit?: number;
}

export interface NotificationQueryInput {
  cursor?: string;
  limit?: number;
  unread?: boolean;
}

export const wsEventNames = {
  conversationJoin: 'conversation:join',
  conversationLeave: 'conversation:leave',
  typing: 'typing',
  messageRead: 'message:read',
  messageNew: 'message:new',
  notificationNew: 'notification:new',
  presence: 'presence',
  bidUpdated: 'bid:updated',
  agreementUpdated: 'agreement:updated',
} as const;

export interface WsServerPayloads {
  'message:new': Message;
  typing: { conversationId: string; userId: string; isTyping: boolean };
  presence: { userId: string; online: boolean };
  'bid:updated': unknown;
  'agreement:updated': unknown;
  'message:read': {
    conversationId: string;
    userId: string;
    lastMessageId: string;
  };
  'notification:new': Notification;
}
