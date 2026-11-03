'use client';

import * as React from 'react';
import { Download, FileText, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAttachmentUrl } from '@/lib/api/uploads';
import { safeMediaUrl } from '@/lib/safe-url';
import { formatFileSize } from '@/lib/format';
import type { Attachment } from '@/lib/api/types';

export interface BidAttachmentsProps {
  attachments?: Attachment[];
  layout?: 'full' | 'compact';
  className?: string;
}

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
  const safeUrl = safeMediaUrl(resolvedUrl);
  const isImage = isImageAttachment(attachment);

  React.useEffect(() => {
    if (!resolvedUrl) {
      let isCancelled = false;
      void getAttachmentUrl(attachment.id)
        .then((res) => {
          if (!isCancelled && res.url) {
            setResolvedUrl(res.url);
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

  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (safeUrl) {
      return;
    }
    e.preventDefault();
    try {
      const res = await getAttachmentUrl(attachment.id);
      const fetchedSafeUrl = safeMediaUrl(res.url);
      if (fetchedSafeUrl) {
        setResolvedUrl(res.url);
        window.open(fetchedSafeUrl, '_blank', 'noopener,noreferrer');
      }
    } catch {
      // User can retry
    }
  };

  if (isImage) {
    return (
      <a
        href={safeUrl || '#'}
        target={safeUrl ? '_blank' : undefined}
        rel={safeUrl ? 'noopener noreferrer' : undefined}
        onClick={(e) => {
          void handleClick(e);
        }}
        aria-label={`View image attachment ${attachment.fileName}`}
        className={cn(
          'group relative inline-flex items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring transition-colors hover:border-primary',
          compact ? 'h-10 w-10 shrink-0' : 'h-16 w-16 sm:h-20 sm:w-20',
        )}
      >
        {safeUrl ? (
          <img
            src={safeUrl}
            alt={attachment.fileName}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageIcon className={compact ? 'h-4 w-4' : 'h-6 w-6'} aria-hidden="true" />
          </div>
        )}
      </a>
    );
  }

  return (
    <a
      href={safeUrl || '#'}
      target={safeUrl ? '_blank' : undefined}
      rel={safeUrl ? 'noopener noreferrer' : undefined}
      onClick={(e) => {
        void handleClick(e);
      }}
      aria-label={`Download ${attachment.fileName} (${formatFileSize(attachment.sizeBytes)})`}
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
      <Download
        className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0 ml-auto"
        aria-hidden="true"
      />
    </a>
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
