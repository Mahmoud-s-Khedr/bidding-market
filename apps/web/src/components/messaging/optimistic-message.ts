import type { Attachment } from '@/lib/api/types';
import type { Message, MessageType } from '@/lib/api/messaging-types';

export interface OptimisticMessage extends Message {
  _status?: 'pending' | 'error';
  _error?: string;
  _rawInput?: {
    type: MessageType;
    body?: string;
    attachmentIds?: string[];
    voiceDurationSec?: number;
    attachments?: Attachment[];
  };
}

/**
 * Checks whether a server message echoes or reconciles a pending optimistic message.
 * Matches on sender, message type, body content, attachments and voice duration.
 */
export function isMatchingOptimistic(optimistic: OptimisticMessage, serverMsg: Message): boolean {
  if (optimistic.id === serverMsg.id) return true;
  if (!optimistic.id.startsWith('temp-')) return false;

  // Sender must match
  if (optimistic.sender.id !== serverMsg.sender.id) return false;

  // Type must match
  if (optimistic.type !== serverMsg.type) return false;

  // Body must match
  const optBody = (optimistic.body ?? '').trim();
  const srvBody = (serverMsg.body ?? '').trim();
  if (optBody !== srvBody) return false;

  // Voice duration must match within 2 seconds
  if (optimistic.type === 'VOICE') {
    const optDur = optimistic.voiceDurationSec ?? 0;
    const srvDur = serverMsg.voiceDurationSec ?? 0;
    if (Math.abs(optDur - srvDur) > 2) return false;
  }

  // Attachments must match
  const optAttachments = optimistic.attachments || [];
  const srvAttachments = serverMsg.attachments || [];
  if (optAttachments.length !== srvAttachments.length) return false;

  if (optAttachments.length > 0) {
    const srvIds = new Set(srvAttachments.map((a) => a.id));
    const srvFileNames = new Set(srvAttachments.map((a) => a.fileName));
    const matchesAll = optAttachments.every(
      (a) => srvIds.has(a.id) || srvFileNames.has(a.fileName),
    );
    if (!matchesAll) return false;
  }

  return true;
}
