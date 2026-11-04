import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openFreshAttachment } from './attachments';
import * as uploadsApi from './api/uploads';
import { toast } from '@/components/ui/toast';

describe('openFreshAttachment helper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('synchronously opens blank window with noopener and noreferrer, then navigates to fresh URL', async () => {
    const mockWindow = {
      opener: {} as unknown,
      location: { href: '' },
      close: vi.fn(),
    };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(mockWindow as unknown as Window);
    const fetchSpy = vi.spyOn(uploadsApi, 'getAttachmentUrl').mockResolvedValue({
      url: 'https://cdn.example.com/files/spec.pdf',
      expiresAt: '2026-11-04T12:00:00Z',
    });

    const result = await openFreshAttachment('att-123');

    expect(openSpy).toHaveBeenCalledWith('about:blank', '_blank', 'noopener,noreferrer');
    expect(mockWindow.opener).toBeNull();
    expect(fetchSpy).toHaveBeenCalledWith('att-123');
    expect(mockWindow.location.href).toBe('https://cdn.example.com/files/spec.pdf');
    expect(result).toBe('https://cdn.example.com/files/spec.pdf');
  });

  it('toasts "Allow pop-ups to download" when window.open returns null (popup blocked)', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    vi.spyOn(uploadsApi, 'getAttachmentUrl').mockResolvedValue({
      url: 'https://cdn.example.com/files/spec.pdf',
      expiresAt: '2026-11-04T12:00:00Z',
    });

    const mockToast = vi.fn();
    const result = await openFreshAttachment('att-blocked', { toast: mockToast });

    expect(result).toBe('https://cdn.example.com/files/spec.pdf');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Allow pop-ups to download',
        variant: 'error',
      }),
    );
  });

  it('uses default toast.error when no custom toast function is passed and popup is blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    vi.spyOn(uploadsApi, 'getAttachmentUrl').mockResolvedValue({
      url: 'https://cdn.example.com/files/spec.pdf',
      expiresAt: '2026-11-04T12:00:00Z',
    });
    const toastErrorSpy = vi.spyOn(toast, 'error').mockReturnValue('');

    const result = await openFreshAttachment('att-blocked-default');

    expect(result).toBe('https://cdn.example.com/files/spec.pdf');
    expect(toastErrorSpy).toHaveBeenCalledWith(
      'Allow pop-ups to download',
      expect.stringContaining('enable pop-ups'),
    );
  });

  it('falls back to window.location.assign when popup blocked and fallbackToAssign is enabled', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    vi.spyOn(uploadsApi, 'getAttachmentUrl').mockResolvedValue({
      url: 'https://cdn.example.com/files/spec.pdf',
      expiresAt: '2026-11-04T12:00:00Z',
    });

    const assignSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, assign: assignSpy },
    });

    await openFreshAttachment('att-fallback', { fallbackToAssign: true });

    expect(assignSpy).toHaveBeenCalledWith('https://cdn.example.com/files/spec.pdf');
  });

  it('closes blank window, toasts error, and re-throws when fetch fails', async () => {
    const mockWindow = {
      opener: {} as unknown,
      location: { href: '' },
      close: vi.fn(),
    };
    vi.spyOn(window, 'open').mockReturnValue(mockWindow as unknown as Window);
    vi.spyOn(uploadsApi, 'getAttachmentUrl').mockRejectedValue(new Error('Network error'));

    const mockToast = vi.fn();
    await expect(openFreshAttachment('att-err', { toast: mockToast })).rejects.toThrow(
      'Network error',
    );

    expect(mockWindow.close).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Download failed',
        description: 'Network error',
        variant: 'error',
      }),
    );
  });

  it('closes blank window, toasts error, and throws when URL fails safe validation', async () => {
    const mockWindow = {
      opener: {} as unknown,
      location: { href: '' },
      close: vi.fn(),
    };
    vi.spyOn(window, 'open').mockReturnValue(mockWindow as unknown as Window);
    vi.spyOn(uploadsApi, 'getAttachmentUrl').mockResolvedValue({
      url: 'javascript:alert(1)',
      expiresAt: '2026-11-04T12:00:00Z',
    });

    const mockToast = vi.fn();
    await expect(openFreshAttachment('att-unsafe', { toast: mockToast })).rejects.toThrow(
      'Invalid download URL',
    );

    expect(mockWindow.close).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Download failed',
        description: 'Invalid download URL',
        variant: 'error',
      }),
    );
  });

  it('handles window.open throwing an error safely', async () => {
    vi.spyOn(window, 'open').mockImplementation(() => {
      throw new Error('Blocked by security policy');
    });
    vi.spyOn(uploadsApi, 'getAttachmentUrl').mockResolvedValue({
      url: 'https://cdn.example.com/files/safe.pdf',
      expiresAt: '2026-11-04T12:00:00Z',
    });

    const mockToast = vi.fn();
    const result = await openFreshAttachment('att-throws', { toast: mockToast });

    expect(result).toBe('https://cdn.example.com/files/safe.pdf');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Allow pop-ups to download',
        variant: 'error',
      }),
    );
  });
});
