import * as React from 'react';
import { UploadCloud, X, FileText, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { uploadFile } from '@/lib/upload';
import type { Attachment, UploadPurpose } from '@/lib/api/types';

export interface FileDropzoneProps {
  purpose: UploadPurpose;
  value?: Attachment[];
  onChange?: (attachments: Attachment[]) => void;
  onUploadStateChange?: (state: { inFlightCount: number; hasErrors: boolean }) => void;
  maxFiles?: number;
  accept?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  description?: string;
}

interface InFlightUpload {
  id: string;
  file: File;
  progress: number;
  error?: string;
  controller: AbortController;
  previewUrl?: string;
}

export function FileDropzone({
  purpose,
  value = [],
  onChange,
  onUploadStateChange,
  maxFiles = 10,
  accept,
  disabled = false,
  className,
  label = 'Upload files',
  description,
}: FileDropzoneProps) {
  const [inFlight, setInFlight] = React.useState<InFlightUpload[]>([]);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const committedAttachmentsRef = React.useRef<Attachment[]>(value);
  React.useEffect(() => {
    committedAttachmentsRef.current = value;
  }, [value]);

  React.useEffect(() => {
    const inFlightCount = inFlight.filter((u) => !u.error).length;
    const hasErrors = inFlight.some((u) => Boolean(u.error));
    onUploadStateChange?.({ inFlightCount, hasErrors });
  }, [inFlight, onUploadStateChange]);

  const isImagePurpose = purpose === 'LISTING_IMAGE' || purpose === 'AVATAR';
  const resolvedAccept =
    accept ??
    (isImagePurpose
      ? 'image/jpeg,image/png,image/webp,image/gif'
      : '.pdf,.docx,.doc,.xlsx,.xls,.txt,.zip,image/jpeg,image/png');

  const canUploadMore = value.length + inFlight.length < maxFiles;

  const handleFiles = (files: FileList | File[]) => {
    if (disabled || !canUploadMore) return;

    const remainingSlots = maxFiles - (value.length + inFlight.length);
    const filesToUpload = Array.from(files).slice(0, remainingSlots);

    const newUploads: InFlightUpload[] = filesToUpload.map((file) => {
      const controller = new AbortController();
      let previewUrl: string | undefined = undefined;
      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file);
      }
      return {
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        progress: 0,
        controller,
        previewUrl,
      };
    });

    setInFlight((prev) => [...prev, ...newUploads]);

    newUploads.forEach((item) => {
      uploadFile(item.file, purpose, {
        signal: item.controller.signal,
        onProgress: (percent) => {
          setInFlight((prev) =>
            prev.map((u) => (u.id === item.id ? { ...u, progress: percent } : u)),
          );
        },
      })
        .then((attachment) => {
          if (item.controller.signal.aborted) {
            setInFlight((prev) => prev.filter((u) => u.id !== item.id));
            if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
            return;
          }
          setInFlight((prev) => prev.filter((u) => u.id !== item.id));
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
          const next = [...committedAttachmentsRef.current, attachment];
          committedAttachmentsRef.current = next;
          onChange?.(next);
        })
        .catch((err: unknown) => {
          if (item.controller.signal.aborted) {
            setInFlight((prev) => prev.filter((u) => u.id !== item.id));
            if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
            return;
          }
          const message = err instanceof Error ? err.message : 'Upload failed';
          setInFlight((prev) => prev.map((u) => (u.id === item.id ? { ...u, error: message } : u)));
        });
    });
  };

  const handleCancel = (uploadId: string) => {
    setInFlight((prev) => {
      const item = prev.find((u) => u.id === uploadId);
      if (item) {
        item.controller.abort();
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
      return prev.filter((u) => u.id !== uploadId);
    });
  };

  const handleRemoveExisting = (attachmentId: string) => {
    const next = value.filter((a) => a.id !== attachmentId);
    committedAttachmentsRef.current = next;
    onChange?.(next);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && canUploadMore) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (!disabled && canUploadMore && e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && !disabled && canUploadMore) {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={cn('space-y-3', className)}>
      {canUploadMore && (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-label={label}
          onClick={() => !disabled && inputRef.current?.click()}
          onKeyDown={handleKeyDown}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'group relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border px-6 py-8 text-center transition-colors',
            'hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            isDragOver && 'border-primary bg-primary/5',
            disabled && 'pointer-events-none opacity-50',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            multiple={maxFiles > 1}
            accept={resolvedAccept}
            tabIndex={-1}
            disabled={disabled}
            className="sr-only"
            onChange={(e) => {
              if (e.target.files) {
                handleFiles(e.target.files);
                e.target.value = '';
              }
            }}
          />

          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
            <UploadCloud className="h-6 w-6" />
          </div>

          <p className="text-sm font-medium text-foreground">
            <span className="text-primary hover:underline font-semibold">Click to upload</span> or
            drag and drop
          </p>

          <p className="text-xs text-muted-foreground mt-1">
            {description ||
              (isImagePurpose
                ? `JPEG, PNG, WebP or GIF (max 10 MB each, up to ${maxFiles} items)`
                : `PDF, Word, Excel, TXT, ZIP or images (max 25 MB each, up to ${maxFiles} items)`)}
          </p>
        </div>
      )}

      {/* Files list / previews */}
      {(value.length > 0 || inFlight.length > 0) && (
        <div className="space-y-2">
          {/* Successfully uploaded attachments */}
          {value.map((attachment) => {
            const isImage = attachment.mimeType.startsWith('image/');
            return (
              <div
                key={attachment.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-md border border-border bg-card text-card-foreground shadow-xs text-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {isImage ? (
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded border border-border bg-muted flex items-center justify-center">
                      <img
                        src={attachment.url}
                        alt={attachment.fileName}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                      <FileText className="h-5 w-5" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{attachment.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(attachment.sizeBytes)}
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${attachment.fileName}`}
                  onClick={() => handleRemoveExisting(attachment.id)}
                  disabled={disabled}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}

          {/* In-flight / uploading files */}
          {inFlight.map((item) => (
            <div
              key={item.id}
              className={cn(
                'p-2.5 rounded-md border bg-card text-card-foreground shadow-xs text-sm space-y-1.5',
                item.error ? 'border-destructive/40 bg-destructive/5' : 'border-border',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  {item.previewUrl ? (
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded border border-border bg-muted">
                      <img
                        src={item.previewUrl}
                        alt={item.file.name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{item.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(item.file.size)}
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Cancel upload of ${item.file.name}`}
                  onClick={() => handleCancel(item.id)}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {item.error ? (
                <div role="alert" className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{item.error}</span>
                </div>
              ) : (
                <div className="space-y-1">
                  <div
                    role="progressbar"
                    aria-valuenow={item.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Upload progress for ${item.file.name}`}
                    className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
                  >
                    <div
                      className="h-full bg-primary transition-all duration-200"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Uploading...</span>
                    <span>{item.progress}%</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
