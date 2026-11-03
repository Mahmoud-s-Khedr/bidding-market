import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BidAttachments } from './bid-attachments';
import * as uploadsApi from '@/lib/api/uploads';
import type { Attachment } from '@/lib/api/types';

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('BidAttachments component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
    const { container: c1 } = renderWithQuery(<BidAttachments attachments={[]} />);
    expect(c1).toBeEmptyDOMElement();

    const { container: c2 } = renderWithQuery(<BidAttachments attachments={undefined} />);
    expect(c2).toBeEmptyDOMElement();
  });

  it('renders image attachment as thumbnail and document as name+size download link', () => {
    renderWithQuery(<BidAttachments attachments={[mockImageAttachment, mockPdfAttachment]} />);

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
    renderWithQuery(
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

    renderWithQuery(<BidAttachments attachments={[attWithoutUrl]} />);

    await waitFor(() => {
      expect(uploadsApi.getAttachmentUrl).toHaveBeenCalledWith('att-no-url');
      const link = screen.getByRole('link', { name: /download contract\.pdf/i });
      expect(link).toHaveAttribute('href', 'http://localhost:4000/files/contract.pdf');
    });
  });

  it('fetches presigned URL and opens window on click if URL failed initial fetch', async () => {
    const user = userEvent.setup();
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const attNoUrl: Attachment = {
      id: 'att-click-fallback',
      key: 'uploads/fallback.pdf',
      fileName: 'fallback.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
    };

    // First call (from useEffect) fails
    vi.spyOn(uploadsApi, 'getAttachmentUrl')
      .mockRejectedValueOnce(new Error('Network error on load'))
      .mockResolvedValueOnce({
        url: 'http://localhost:4000/files/fresh-url.pdf',
        expiresAt: '2026-11-04T12:00:00Z',
      });

    renderWithQuery(<BidAttachments attachments={[attNoUrl]} />);

    const link = screen.getByRole('link', { name: /download fallback\.pdf/i });
    await user.click(link);

    await waitFor(() => {
      expect(uploadsApi.getAttachmentUrl).toHaveBeenCalledWith('att-click-fallback');
      expect(windowOpenSpy).toHaveBeenCalledWith(
        'http://localhost:4000/files/fresh-url.pdf',
        '_blank',
        'noopener,noreferrer',
      );
    });
  });
});
