'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, ZoomIn } from 'lucide-react';
import { Dialog, DialogOverlay, DialogPortal } from '@/components/ui/dialog';

export interface LightboxProps {
  src: string | null;
  alt?: string;
  onClose: () => void;
}

export function Lightbox({ src, alt = 'Image preview', onClose }: LightboxProps) {
  return (
    <Dialog open={Boolean(src)} onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay className="bg-black/80 backdrop-blur-sm z-50 fixed inset-0" />
        <DialogPrimitive.Content
          aria-label="Image preview lightbox"
          className="fixed left-[50%] top-[50%] z-50 -translate-x-1/2 -translate-y-1/2 max-w-4xl max-h-[90vh] p-2 bg-transparent border-none shadow-none focus:outline-none flex flex-col items-center justify-center"
        >
          {src && (
            <div className="relative group max-w-full max-h-[85vh] overflow-hidden rounded-lg flex items-center justify-center">
              <img
                src={src}
                alt={alt}
                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
              />
              <DialogPrimitive.Close
                aria-label="Close image preview"
                className="absolute top-3 right-3 p-2 rounded-full bg-black/60 hover:bg-black/90 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <X className="h-5 w-5" />
              </DialogPrimitive.Close>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

export function ImageAttachmentThumbnail({
  src,
  alt = 'Attached image',
  onClick,
}: {
  src: string;
  alt?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`View full image ${alt}`}
      className="group relative block overflow-hidden rounded-md border border-border/60 hover:border-primary/50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <img
        src={src}
        alt={alt}
        className="h-32 w-44 object-cover transition-transform duration-200 group-hover:scale-105"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
        <ZoomIn className="h-5 w-5 drop-shadow" />
      </div>
    </button>
  );
}
