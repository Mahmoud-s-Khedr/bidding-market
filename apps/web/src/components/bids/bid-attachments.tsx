'use client';

import * as React from 'react';
import { Download, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAttachmentUrl } from '@/lib/api/uploads';
import { safeMediaUrl } from '@/lib/safe-url';
import { formatFileSize } from '@/lib/format';
import { toast, useOptionalToast } from '@/components/ui/toast';
import type { Attachment } from '@/lib/api/types';

export interface BidAttachmentsProps {
  attachments?: Attachment[];
  layout?: 'full' | 'compact';
  className?: string;
}

export const ATTACHMENT_TTL_MS = 4 * 60 * 1000; // 4 minutes (~240s, safely under 300s presign TTL)

export function isImageAttachment(att: Attachment): boolean {
  if (att.mimeType && att.mimeType.startsWith('image/')) {
    return true;
  }
  return /\.(jpe?g|png|webp|gif|svg)$/i.test(att.fileName);
}

function BidAttachmentItem({
  attachment,
  compact = false,
}: {
  attachment: Attachment;
  compact?: boolean;
}) {
  const [resolvedUrl, setResolvedUrl] = React.useState<string | undefined>(attachment.url);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const fetchedAtRef = React.useRef<number>(attachment.url ? Date.now() : 0);
  const isRefreshingRef = React.useRef(false);
  const hasRetriedErrorRef = React.useRef(false);
  const isMountedRef = React.useRef(true);

  const toastContext = useOptionalToast();
  const safeUrl = safeMediaUrl(resolvedUrl);
  const isImage = isImageAttachment(attachment);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    setResolvedUrl(attachment.url);
    fetchedAtRef.current = attachment.url ? Date.now() : 0;
    hasRetriedErrorRef.current = false;
    setErrorMessage(null);
  }, [attachment.id, attachment.url]);

  // Initial fetch if attachment didn't include a url
  React.useEffect(() => {
    if (!resolvedUrl) {
      let isCancelled = false;
      void getAttachmentUrl(attachment.id)
        .then((res) => {
          if (!isCancelled && res.url) {
            setResolvedUrl(res.url);
            fetchedAtRef.current = Date.now();
          }
        })
        .catch(() => {
          // Handled on click
        });
      return () => {
        isCancelled = true;
      };
    }
  }, [attachment.id, resolvedUrl]);

  // Auto-refresh inline image thumbnails before presigned URL expires (~4 minutes)
  React.useEffect(() => {
    if (!isImage || !resolvedUrl) {
      return;
    }

    const timer = setTimeout(() => {
      let isCancelled = false;
      void getAttachmentUrl(attachment.id)
        .then((res) => {
          if (!isCancelled && res.url) {
            setResolvedUrl(res.url);
            fetchedAtRef.current = Date.now();
            hasRetriedErrorRef.current = false;
          }
        })
        .catch(() => {
          // Handled on onError or on click
        });

      return () => {
        isCancelled = true;
      };
    }, ATTACHMENT_TTL_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [attachment.id, isImage, resolvedUrl]);

  // Refresh image when it errors (e.g. presigned URL expired or network issue)
  const handleImageError = async () => {
    if (isRefreshingRef.current || hasRetriedErrorRef.current) return;
    hasRetriedErrorRef.current = true;
    isRefreshingRef.current = true;

    try {
      const res = await getAttachmentUrl(attachment.id);
      const freshSafeUrl = safeMediaUrl(res.url);
      if (freshSafeUrl && isMountedRef.current && res.url !== resolvedUrl) {
        setResolvedUrl(res.url);
        fetchedAtRef.current = Date.now();
      }
    } catch {
      // Keep placeholder
    } finally {
      isRefreshingRef.current = false;
    }
  };

  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    const isStale =
      !resolvedUrl ||
      !safeUrl ||
      !fetchedAtRef.current ||
      Date.now() - fetchedAtRef.current >= ATTACHMENT_TTL_MS;

    if (!isStale) {
      return;
    }

    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    let targetWindow: Window | null = null;
    try {
      targetWindow = window.open('about:blank', '_blank');
      if (targetWindow) {
        try {
          targetWindow.opener = null;
        } catch {
          // Ignore
        }
      }
    } catch {
      targetWindow = null;
    }

    try {
      const res = await getAttachmentUrl(attachment.id);
      const freshSafeUrl = safeMediaUrl(res.url);
      if (!freshSafeUrl) {
        throw new Error('Invalid download URL');
      }

      if (isMountedRef.current) {
        setResolvedUrl(res.url);
        fetchedAtRef.current = Date.now();
      }

      if (targetWindow) {
        try {
          targetWindow.location.href = freshSafeUrl;
        } catch {
          // Ignore
        }
      }
    } catch (err: unknown) {
      if (targetWindow) {
        try {
          targetWindow.close();
        } catch {
          // Ignore
        }
      }
      const msg = err instanceof Error ? err.message : 'Failed to download attachment';
      if (toastContext) {
        toastContext.toast({
          title: 'Download failed',
          description: msg,
          variant: 'error',
        });
      } else {
        toast.error('Download failed', msg);
      }
      if (isMountedRef.current) {
        setErrorMessage(msg);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  if (isImage) {
    return (
      <div className="relative inline-flex flex-col items-center">
        <a
          href={safeUrl || '#'}
          target={safeUrl ? '_blank' : undefined}
          rel={safeUrl ? 'noopener noreferrer' : undefined}
          onClick={(e) => {
            void handleClick(e);
          }}
          aria-label={`View image attachment ${attachment.fileName}`}
          aria-busy={isLoading}
          className={cn(
            'group relative inline-flex items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring transition-colors hover:border-primary',
            compact ? 'h-10 w-10 shrink-0' : 'h-16 w-16 sm:h-20 sm:w-20',
          )}
        >
          {safeUrl ? (
            <img
              src={safeUrl}
              alt={attachment.fileName}
              onError={() => {
                void handleImageError();
              }}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImageIcon className={compact ? 'h-4 w-4' : 'h-6 w-6'} aria-hidden="true" />
            </div>
          )}
          {isLoading && (
            <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
            </div>
          )}
        </a>
        {errorMessage && (
          <span className="sr-only" role="alert">
            {errorMessage}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col">
      <a
        href={safeUrl || '#'}
        target={safeUrl ? '_blank' : undefined}
        rel={safeUrl ? 'noopener noreferrer' : undefined}
        onClick={(e) => {
          void handleClick(e);
        }}
        aria-label={`Download ${attachment.fileName} (${formatFileSize(attachment.sizeBytes)})`}
        aria-busy={isLoading}
        className={cn(
          'group inline-flex items-center gap-2 rounded-md border border-border bg-card text-xs text-foreground hover:bg-muted/40 hover:border-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring transition-colors',
          compact ? 'px-2 py-1 max-w-[200px]' : 'px-3 py-2 max-w-sm',
        )}
      >
        <FileText className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
        <span className="truncate font-medium">{attachment.fileName}</span>
        <span className="text-[11px] text-muted-foreground shrink-0">
          ({formatFileSize(attachment.sizeBytes)})
        </span>
        {isLoading ? (
          <Loader2
            className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0 ml-auto"
            aria-hidden="true"
          />
        ) : (
          <Download
            className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0 ml-auto"
            aria-hidden="true"
          />
        )}
      </a>
      {errorMessage && (
        <span className="text-xs text-destructive mt-0.5" role="alert">
          {errorMessage}
        </span>
      )}
    </div>
  );
}

export function BidAttachments({ attachments, layout = 'full', className }: BidAttachmentsProps) {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  const images = attachments.filter(isImageAttachment);
  const files = attachments.filter((att) => !isImageAttachment(att));

  if (layout === 'compact') {
    return (
      <div
        className={cn('flex flex-wrap items-center gap-2', className)}
        data-testid="bid-attachments-compact"
      >
        {attachments.map((att) => (
          <BidAttachmentItem key={att.id} attachment={att} compact />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn('space-y-3', className)}
      data-testid="bid-attachments"
      aria-label="Bid Attachments"
    >
      {images.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Images:</span>
          <div className="flex flex-wrap items-center gap-2">
            {images.map((att) => (
              <BidAttachmentItem key={att.id} attachment={att} />
            ))}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Documents & Files:</span>
          <div className="flex flex-wrap items-center gap-2">
            {files.map((att) => (
              <BidAttachmentItem key={att.id} attachment={att} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
