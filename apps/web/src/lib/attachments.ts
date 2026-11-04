import { getAttachmentUrl } from './api/uploads';
import { safeMediaUrl } from './safe-url';
import { toast, type ToastVariant } from '@/components/ui/toast';

export interface OpenFreshAttachmentOptions {
  toast?: (options: { title?: string; description?: string; variant?: ToastVariant }) => void;
  fallbackToAssign?: boolean;
}

/**
 * Synchronously opens a blank target window (preserving user-gesture privilege),
 * retrieves a fresh presigned GET URL for the attachment ID, sanitizes it,
 * and navigates the target window to the safe URL.
 *
 * If popup blockers prevent window.open from succeeding (returns null), toasts
 * "Allow pop-ups to download" and optionally falls back to window.location.assign.
 */
export async function openFreshAttachment(
  id: string,
  options?: OpenFreshAttachmentOptions,
): Promise<string> {
  const notify = options?.toast;

  const showToast = (opts: { title?: string; description?: string; variant?: ToastVariant }) => {
    if (notify) {
      notify(opts);
    } else if (opts.variant === 'error') {
      toast.error(opts.title ?? 'Error', opts.description);
    } else {
      toast.custom(opts);
    }
  };

  let targetWindow: Window | null = null;
  try {
    targetWindow = window.open('about:blank', '_blank', 'noopener,noreferrer');
    if (targetWindow) {
      try {
        targetWindow.opener = null;
      } catch {
        // Ignore cross-origin opener errors
      }
    }
  } catch {
    targetWindow = null;
  }

  let rawUrl: string | undefined;
  try {
    const res = await getAttachmentUrl(id);
    rawUrl = res.url;
  } catch (err: unknown) {
    if (targetWindow) {
      try {
        targetWindow.close();
      } catch {
        // Ignore
      }
    }
    const msg = err instanceof Error ? err.message : 'Failed to retrieve download URL';
    showToast({
      title: 'Download failed',
      description: msg,
      variant: 'error',
    });
    throw err;
  }

  const safeUrl = safeMediaUrl(rawUrl);
  if (!safeUrl) {
    if (targetWindow) {
      try {
        targetWindow.close();
      } catch {
        // Ignore
      }
    }
    const msg = 'Invalid download URL';
    showToast({
      title: 'Download failed',
      description: msg,
      variant: 'error',
    });
    throw new Error(msg);
  }

  if (targetWindow) {
    try {
      targetWindow.location.href = safeUrl;
    } catch {
      // Ignore
    }
  } else {
    // Popup was blocked by browser
    showToast({
      title: 'Allow pop-ups to download',
      description:
        'Your browser blocked opening the attachment. Please enable pop-ups for this site.',
      variant: 'error',
    });
    if (options?.fallbackToAssign) {
      try {
        window.location.assign(safeUrl);
      } catch {
        // Ignore
      }
    }
  }

  return safeUrl;
}
