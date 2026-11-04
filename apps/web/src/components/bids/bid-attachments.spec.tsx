import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BidAttachments, ATTACHMENT_TTL_MS } from './bid-attachments';
import { ToastProvider } from '@/components/ui/toast';
import * as uploadsApi from '@/lib/api/uploads';
import type { Attachment } from '@/lib/api/types';

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

describe('BidAttachments component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mockImageAttachment: Attachment = {
    id: 'att-img-1',
    key: 'uploads/mock-image.png',
    fileName: 'preview-design.png',
    mimeType: 'image/png',
    sizeBytes: 1024 * 512,
    url: 'http://localhost:4000/files/preview-design.png',
  };

  const mockPdfAttachment: Attachment = {
    id: 'att-doc-1',
    key: 'uploads/proposal-specs.pdf',
    fileName: 'proposal-specs.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024 * 1024 * 2.5,
    url: 'http://localhost:4000/files/proposal-specs.pdf',
  };

  it('renders nothing when attachments is empty or undefined', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container: c1 } = render(
      <QueryClientProvider client={queryClient}>
        <BidAttachments attachments={[]} />
      </QueryClientProvider>,
    );
    expect(c1).toBeEmptyDOMElement();

    const { container: c2 } = render(
      <QueryClientProvider client={queryClient}>
        <BidAttachments attachments={undefined} />
      </QueryClientProvider>,
    );
    expect(c2).toBeEmptyDOMElement();
  });

  it('renders image attachment as thumbnail and document as name+size download link', () => {
    renderWithProviders(<BidAttachments attachments={[mockImageAttachment, mockPdfAttachment]} />);

    // Image thumbnail
    const imgThumb = screen.getByRole('img', { name: 'preview-design.png' });
    expect(imgThumb).toBeInTheDocument();
    expect(imgThumb).toHaveAttribute('src', 'http://localhost:4000/files/preview-design.png');

    const imageLink = screen.getByRole('link', {
      name: /view image attachment preview-design\.png/i,
    });
    expect(imageLink).toHaveAttribute('href', 'http://localhost:4000/files/preview-design.png');

    // Document download link
    const docLink = screen.getByRole('link', {
      name: /download proposal-specs\.pdf \(2\.5 MB\)/i,
    });
    expect(docLink).toBeInTheDocument();
    expect(docLink).toHaveAttribute('href', 'http://localhost:4000/files/proposal-specs.pdf');
    expect(screen.getByText('proposal-specs.pdf')).toBeInTheDocument();
    expect(screen.getByText('(2.5 MB)')).toBeInTheDocument();
  });

  it('renders compact layout when layout="compact"', () => {
    renderWithProviders(
      <BidAttachments attachments={[mockImageAttachment, mockPdfAttachment]} layout="compact" />,
    );

    const compactContainer = screen.getByTestId('bid-attachments-compact');
    expect(compactContainer).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'preview-design.png' })).toBeInTheDocument();
    expect(screen.getByText('proposal-specs.pdf')).toBeInTheDocument();
  });

  it('fetches presigned URL when attachment does not include a url', async () => {
    const attWithoutUrl: Attachment = {
      id: 'att-no-url',
      key: 'uploads/doc.pdf',
      fileName: 'contract.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    };

    vi.spyOn(uploadsApi, 'getAttachmentUrl').mockResolvedValue({
      url: 'http://localhost:4000/files/contract.pdf',
      expiresAt: '2026-11-04T12:00:00Z',
    });

    renderWithProviders(<BidAttachments attachments={[attWithoutUrl]} />);

    await waitFor(() => {
      expect(uploadsApi.getAttachmentUrl).toHaveBeenCalledWith('att-no-url');
      const link = screen.getByRole('link', { name: /download contract\.pdf/i });
      expect(link).toHaveAttribute('href', 'http://localhost:4000/files/contract.pdf');
    });
  });

  it('does not refetch on click when the presigned URL is still fresh (< TTL)', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(uploadsApi, 'getAttachmentUrl');

    renderWithProviders(<BidAttachments attachments={[mockPdfAttachment]} />);

    const link = screen.getByRole('link', { name: /download proposal-specs\.pdf/i });
    await user.click(link);

    // URL is fresh, so getAttachmentUrl should not be called
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refetches URL on click when older than TTL and opens fresh URL in new window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const mockWindow = {
      opener: {} as unknown,
      location: { href: '' },
      close: vi.fn(),
    };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(mockWindow as unknown as Window);

    const fetchSpy = vi.spyOn(uploadsApi, 'getAttachmentUrl').mockResolvedValue({
      url: 'http://localhost:4000/files/fresh-proposal-specs.pdf',
      expiresAt: '2026-11-04T12:00:00Z',
    });

    renderWithProviders(<BidAttachments attachments={[mockPdfAttachment]} />);

    const link = screen.getByRole('link', { name: /download proposal-specs\.pdf/i });

    // Advance fake timer past the 4-minute TTL
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ATTACHMENT_TTL_MS + 5000);
    });

    // Clicking stale link triggers synchronous blank window and fresh URL fetch
    act(() => {
      fireEvent.click(link);
    });

    expect(openSpy).toHaveBeenCalledWith('about:blank', '_blank', 'noopener,noreferrer');
    expect(mockWindow.opener).toBeNull();
    expect(fetchSpy).toHaveBeenCalledWith('att-doc-1');

    await waitFor(() => {
      expect(mockWindow.location.href).toBe('http://localhost:4000/files/fresh-proposal-specs.pdf');
      expect(link).toHaveAttribute('href', 'http://localhost:4000/files/fresh-proposal-specs.pdf');
    });
  });

  it('shows error toast/message and closes the blank window on fetch error', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const mockWindow = {
      opener: {} as unknown,
      location: { href: '' },
      close: vi.fn(),
    };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(mockWindow as unknown as Window);

    vi.spyOn(uploadsApi, 'getAttachmentUrl').mockRejectedValue(
      new Error('S3 signature verification failed'),
    );

    renderWithProviders(<BidAttachments attachments={[mockPdfAttachment]} />);

    const link = screen.getByRole('link', { name: /download proposal-specs\.pdf/i });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ATTACHMENT_TTL_MS + 1000);
    });

    act(() => {
      fireEvent.click(link);
    });

    expect(openSpy).toHaveBeenCalledWith('about:blank', '_blank', 'noopener,noreferrer');

    await waitFor(() => {
      expect(mockWindow.close).toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(/S3 signature verification failed/i);
    });
  });

  it('closes blank window and shows error if returned URL fails safe validation', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const mockWindow = {
      opener: {} as unknown,
      location: { href: '' },
      close: vi.fn(),
    };
    vi.spyOn(window, 'open').mockReturnValue(mockWindow as unknown as Window);

    vi.spyOn(uploadsApi, 'getAttachmentUrl').mockResolvedValue({
      url: 'javascript:alert("pwned")',
      expiresAt: '2026-11-04T12:00:00Z',
    });

    renderWithProviders(<BidAttachments attachments={[mockPdfAttachment]} />);

    const link = screen.getByRole('link', { name: /download proposal-specs\.pdf/i });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ATTACHMENT_TTL_MS + 1000);
    });

    act(() => {
      fireEvent.click(link);
    });

    await waitFor(() => {
      expect(mockWindow.close).toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(/Invalid download URL/i);
    });
  });

  it('auto-refreshes inline image thumbnail URL after ~4 minutes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const fetchSpy = vi.spyOn(uploadsApi, 'getAttachmentUrl').mockResolvedValue({
      url: 'http://localhost:4000/files/refreshed-image.png',
      expiresAt: '2026-11-04T12:00:00Z',
    });

    renderWithProviders(<BidAttachments attachments={[mockImageAttachment]} />);

    const imgThumb = screen.getByRole('img', { name: 'preview-design.png' });
    expect(imgThumb).toHaveAttribute('src', 'http://localhost:4000/files/preview-design.png');
    expect(fetchSpy).not.toHaveBeenCalled();

    // Advance fake timer by ATTACHMENT_TTL_MS (4 minutes)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ATTACHMENT_TTL_MS);
    });

    expect(fetchSpy).toHaveBeenCalledWith('att-img-1');

    await waitFor(() => {
      expect(imgThumb).toHaveAttribute('src', 'http://localhost:4000/files/refreshed-image.png');
    });
  });

  it('refreshes inline image thumbnail URL on onError', async () => {
    const fetchSpy = vi.spyOn(uploadsApi, 'getAttachmentUrl').mockResolvedValue({
      url: 'http://localhost:4000/files/recovered-image.png',
      expiresAt: '2026-11-04T12:00:00Z',
    });

    renderWithProviders(<BidAttachments attachments={[mockImageAttachment]} />);

    const imgThumb = screen.getByRole('img', { name: 'preview-design.png' });

    // Simulate image loading error (e.g. presigned url expired in browser cache)
    act(() => {
      fireEvent.error(imgThumb);
    });

    expect(fetchSpy).toHaveBeenCalledWith('att-img-1');

    await waitFor(() => {
      expect(imgThumb).toHaveAttribute('src', 'http://localhost:4000/files/recovered-image.png');
    });

    // Firing error with same URL should not trigger endless loop
    fetchSpy.mockClear();
    act(() => {
      fireEvent.error(imgThumb);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refetches fresh URL when stale image attachment link is clicked', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const mockWindow = {
      opener: {} as unknown,
      location: { href: '' },
      close: vi.fn(),
    };
    vi.spyOn(window, 'open').mockReturnValue(mockWindow as unknown as Window);

    // Initial background timer refresh fails, leaving the link stale
    const fetchSpy = vi
      .spyOn(uploadsApi, 'getAttachmentUrl')
      .mockRejectedValueOnce(new Error('Background timer refresh failed'))
      .mockResolvedValueOnce({
        url: 'http://localhost:4000/files/fresh-highres-image.png',
        expiresAt: '2026-11-04T12:00:00Z',
      });

    renderWithProviders(<BidAttachments attachments={[mockImageAttachment]} />);

    const link = screen.getByRole('link', { name: /view image attachment preview-design\.png/i });

    // Advance fake timer past TTL so background timer attempts refresh and fails
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ATTACHMENT_TTL_MS + 2000);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Now clicking the stale image link triggers a fresh fetch and navigates window
    act(() => {
      fireEvent.click(link);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenLastCalledWith('att-img-1');
    await waitFor(() => {
      expect(mockWindow.location.href).toBe('http://localhost:4000/files/fresh-highres-image.png');
    });
  });

  it('handles window.open returning null gracefully when popup blocker is active', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(window, 'open').mockReturnValue(null);

    const fetchSpy = vi.spyOn(uploadsApi, 'getAttachmentUrl').mockResolvedValue({
      url: 'http://localhost:4000/files/fresh-doc.pdf',
      expiresAt: '2026-11-04T12:00:00Z',
    });

    renderWithProviders(<BidAttachments attachments={[mockPdfAttachment]} />);

    const link = screen.getByRole('link', { name: /download proposal-specs\.pdf/i });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ATTACHMENT_TTL_MS + 1000);
    });

    act(() => {
      fireEvent.click(link);
    });

    expect(fetchSpy).toHaveBeenCalledWith('att-doc-1');
    await waitFor(() => {
      expect(link).toHaveAttribute('href', 'http://localhost:4000/files/fresh-doc.pdf');
      expect(screen.getByText('Allow pop-ups to download')).toBeInTheDocument();
    });
  });
});
