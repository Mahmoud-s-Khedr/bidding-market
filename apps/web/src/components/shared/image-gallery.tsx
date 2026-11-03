import * as React from 'react';
import { ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Attachment } from '@/lib/api/types';

export interface ImageGalleryProps {
  images?: Attachment[];
  title?: string;
  className?: string;
}

export function ImageGallery({
  images = [],
  title = 'Listing image',
  className,
}: ImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const hasImages = images.length > 0;
  const activeImage = hasImages ? images[selectedIndex] : null;

  const handlePrev = React.useCallback(() => {
    if (!hasImages) return;
    setSelectedIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  }, [hasImages, images.length]);

  const handleNext = React.useCallback(() => {
    if (!hasImages) return;
    setSelectedIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  }, [hasImages, images.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!hasImages) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handlePrev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleNext();
    } else if (e.key === 'Home') {
      e.preventDefault();
      setSelectedIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setSelectedIndex(images.length - 1);
    }
  };

  if (!hasImages) {
    return (
      <div
        className={cn(
          'flex aspect-video w-full flex-col items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground',
          className,
        )}
      >
        <ImageIcon className="h-12 w-12 stroke-1 mb-2 opacity-50" />
        <p className="text-xs">No images provided</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn('space-y-3', className)}>
      {/* Main View */}
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted/30">
        {activeImage && (
          <img
            src={activeImage.url}
            alt={`${title} - view ${selectedIndex + 1} of ${images.length}`}
            className="h-full w-full object-contain"
          />
        )}

        {images.length > 1 && (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handlePrev}
              aria-label="Previous view"
              className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full p-0 shadow-md bg-background/80 backdrop-blur-xs hover:bg-background"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleNext}
              aria-label="Next view"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full p-0 shadow-md bg-background/80 backdrop-blur-xs hover:bg-background"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <div className="absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-xs">
              {selectedIndex + 1} / {images.length}
            </div>
          </>
        )}
      </div>

      {/* Thumbnails Strip */}
      {images.length > 1 && (
        <div aria-label="Thumbnails" className="flex items-center gap-2 overflow-x-auto pb-1">
          {images.map((img, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <button
                key={img.id || idx}
                type="button"
                aria-pressed={isSelected}
                aria-label={`Thumbnail ${idx + 1}`}
                onClick={() => setSelectedIndex(idx)}
                onKeyDown={handleKeyDown}
                className={cn(
                  'relative h-16 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-muted transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                  isSelected
                    ? 'ring-2 ring-primary ring-offset-1 border-transparent'
                    : 'opacity-70 hover:opacity-100',
                )}
              >
                {/* Thumbnail image */}
                <img
                  src={img.url}
                  alt=""
                  aria-hidden="true"
                  className="h-full w-full object-cover"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
