'use client';

import * as React from 'react';
import { Loader2, Paperclip, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadFile } from '@/lib/upload';
import type { Attachment } from '@/lib/api/types';
import type { MessageType } from '@/lib/api/messaging-types';
import { VoiceRecorder } from './voice-recorder';

export interface ComposerAttachment extends Attachment {
  progress?: number;
  isUploading?: boolean;
  error?: string;
  previewUrl?: string;
}

export interface ComposerProps {
  conversationId: string;
  onSendMessage: (payload: {
    type: MessageType;
    body?: string;
    attachmentIds?: string[];
    voiceDurationSec?: number;
    attachments?: Attachment[];
  }) => Promise<void>;
  onTyping?: (isTyping: boolean) => void;
  disabled?: boolean;
}

export function Composer({
  conversationId: _conversationId,
  onSendMessage,
  onTyping,
  disabled = false,
}: ComposerProps) {
  const [text, setText] = React.useState('');
  const [attachments, setAttachments] = React.useState<ComposerAttachment[]>([]);
  const [isSending, setIsSending] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const typingTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = React.useRef(false);
  const lastTypingEmittedRef = React.useRef(0);
  const onTypingRef = React.useRef(onTyping);
  onTypingRef.current = onTyping;

  // Clean up timers and emit typing:false on unmount
  React.useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (isTypingRef.current) {
        isTypingRef.current = false;
        onTypingRef.current?.(false);
      }
    };
  }, []);

  const emitTyping = React.useCallback(
    (isTyping: boolean) => {
      const now = Date.now();
      if (isTyping) {
        // Emit immediately if starting, or throttle re-emits to every 2 seconds while continuing to type
        if (!isTypingRef.current || now - lastTypingEmittedRef.current >= 2000) {
          isTypingRef.current = true;
          lastTypingEmittedRef.current = now;
          onTyping?.(true);
        }
      } else {
        if (isTypingRef.current) {
          isTypingRef.current = false;
          lastTypingEmittedRef.current = 0;
          onTyping?.(false);
        }
      }
    },
    [onTyping],
  );

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value.slice(0, 5000);
    setText(val);

    if (val.trim()) {
      emitTyping(true);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        emitTyping(false);
      }, 3000);
    } else {
      emitTyping(false);
    }
  };

  const handleBlur = () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    emitTyping(false);
  };

  const uploadSingleFile = async (file: File) => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const isImage = file.type.startsWith('image/');
    const previewUrl = isImage ? URL.createObjectURL(file) : undefined;

    const initialItem: ComposerAttachment = {
      id: tempId,
      key: '',
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      progress: 0,
      isUploading: true,
      previewUrl,
    };

    setAttachments((prev) => [...prev, initialItem]);

    try {
      const uploaded = await uploadFile(file, 'MESSAGE_ATTACHMENT', {
        onProgress: (percent) => {
          setAttachments((prev) =>
            prev.map((item) => (item.id === tempId ? { ...item, progress: percent } : item)),
          );
        },
      });

      setAttachments((prev) =>
        prev.map((item) =>
          item.id === tempId
            ? {
                ...item,
                ...uploaded,
                url: uploaded.url || previewUrl,
                isUploading: false,
                progress: 100,
              }
            : item,
        ),
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setAttachments((prev) =>
        prev.map((item) =>
          item.id === tempId ? { ...item, isUploading: false, error: errorMessage } : item,
        ),
      );
    }
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f) void uploadSingleFile(f);
    }
    // Reset file input
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    let handledImage = false;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handledImage = true;
            void uploadSingleFile(file);
          }
        }
      }
    }
    if (handledImage) return;

    // Truncate pasted text if it exceeds 5000 characters limit
    const pastedText = e.clipboardData?.getData('text');
    if (pastedText) {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart ?? text.length;
      const end = target.selectionEnd ?? text.length;

      const spaceLeft = 5000 - (text.length - (end - start));
      if (spaceLeft <= 0) return;

      const truncated = pastedText.slice(0, spaceLeft);
      const newText = text.slice(0, start) + truncated + text.slice(end);
      setText(newText);

      if (newText.trim()) {
        emitTyping(true);
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
          emitTyping(false);
        }, 3000);
      }
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    const readyAttachments = attachments.filter((a) => !a.isUploading && !a.error);
    const hasUploading = attachments.some((a) => a.isUploading);

    if (hasUploading || (!trimmed && readyAttachments.length === 0)) {
      return;
    }

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    emitTyping(false);

    let messageType: MessageType = 'TEXT';
    if (readyAttachments.length > 0) {
      const allImages = readyAttachments.every((a) => a.mimeType.startsWith('image/'));
      messageType = allImages ? 'IMAGE' : 'FILE';
    }

    const payload = {
      type: messageType,
      body: trimmed || undefined,
      attachmentIds: readyAttachments.map((a) => a.id),
      attachments: readyAttachments,
    };

    setIsSending(true);
    try {
      await onSendMessage(payload);
      setText('');
      setAttachments([]);
      textareaRef.current?.focus();
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleSendVoice = async (file: File, durationSec: number) => {
    setIsSending(true);
    try {
      const uploaded = await uploadFile(file, 'MESSAGE_ATTACHMENT');
      await onSendMessage({
        type: 'VOICE',
        voiceDurationSec: durationSec,
        attachmentIds: [uploaded.id],
        attachments: [uploaded],
      });
    } finally {
      setIsSending(false);
    }
  };

  const hasUploading = attachments.some((a) => a.isUploading);
  const canSend =
    (text.trim().length > 0 || attachments.some((a) => !a.isUploading && !a.error)) &&
    !hasUploading &&
    !isSending &&
    !disabled;

  return (
    <div className="flex flex-col gap-2 p-3 bg-card border-t border-border">
      {/* Pending Attachments List */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 pb-1" role="region" aria-label="Attachments list">
          {attachments.map((att) => {
            const isImage = att.mimeType.startsWith('image/');
            return (
              <div
                key={att.id}
                className="group relative flex items-center gap-2 p-1.5 pr-2 rounded-lg border border-border bg-background text-xs max-w-xs shadow-xs"
              >
                {isImage && (att.previewUrl || att.url) ? (
                  <img
                    src={att.previewUrl || att.url}
                    alt={att.fileName}
                    className="h-10 w-10 object-cover rounded-md"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Paperclip className="h-5 w-5" />
                  </div>
                )}

                <div className="flex flex-col min-w-0 max-w-[140px]">
                  <span className="truncate font-medium text-foreground">{att.fileName}</span>
                  {att.isUploading ? (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> {att.progress}%
                    </span>
                  ) : att.error ? (
                    <span className="text-[11px] text-destructive truncate">{att.error}</span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Ready</span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  aria-label={`Remove attachment ${att.fileName}`}
                  className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors ml-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFilesSelected}
          multiple
          className="hidden"
          accept="image/*,application/pdf,text/plain,audio/*"
          aria-label="Upload files or images"
        />

        {/* Attachment button */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isSending}
          aria-label="Attach file or image"
          className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground shrink-0"
        >
          <Paperclip className="h-5 w-5" />
        </Button>

        {/* Voice recorder */}
        <VoiceRecorder onSendVoice={handleSendVoice} isUploading={isSending} className="shrink-0" />

        {/* Text input textarea */}
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onPaste={handlePaste}
            placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
            rows={1}
            disabled={disabled || isSending}
            aria-label="Message text"
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-h-36 min-h-[40px] leading-relaxed transition-all"
          />

          {text.length > 4000 && (
            <span
              aria-live="polite"
              className={`absolute right-2 bottom-2 text-[10px] tabular-nums font-mono ${
                text.length >= 5000 ? 'text-destructive font-bold' : 'text-muted-foreground'
              }`}
            >
              {5000 - text.length}
            </span>
          )}
        </div>

        {/* Send button */}
        <Button
          type="button"
          size="sm"
          onClick={() => {
            void handleSend();
          }}
          disabled={!canSend}
          aria-label="Send message"
          className="h-9 w-9 p-0 rounded-lg shrink-0"
        >
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
