import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ImageAttachmentThumbnail, Lightbox } from './lightbox';
import * as uploadsApi from '@/lib/api/uploads';

vi.mock('@/lib/api/uploads', () => ({
  getAttachmentUrl: vi.fn(),
}));

describe('Lightbox & ImageAttachmentThumbnail', () => {
  it('renders thumbnail and triggers onClick', () => {
    const handleClick = vi.fn();
    render(
      <ImageAttachmentThumbnail
        src="https://cdn.example.com/thumb.jpg"
        alt="Thumbnail preview"
        onClick={handleClick}
      />,
    );

    const button = screen.getByRole('button', { name: /view full image/i });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders lightbox when src is provided and closes on close button', () => {
    const handleClose = vi.fn();
    render(
      <Lightbox src="https://cdn.example.com/full.jpg" alt="Full image" onClose={handleClose} />,
    );

    expect(screen.getByRole('dialog', { name: /image preview lightbox/i })).toBeInTheDocument();
    const closeBtn = screen.getByRole('button', { name: /close image preview/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('does not render lightbox dialog when src is null', () => {
    render(<Lightbox src={null} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('refreshes expired presigned URL via getAttachmentUrl on image load error', async () => {
    vi.mocked(uploadsApi.getAttachmentUrl).mockResolvedValue({
      url: 'https://cdn.example.com/refreshed.jpg',
      expiresAt: '2026-11-03T12:00:00Z',
    });

    render(
      <ImageAttachmentThumbnail
        src="https://cdn.example.com/expired.jpg"
        uploadId="att-123"
        alt="Thumbnail with expired url"
        onClick={vi.fn()}
      />,
    );

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://cdn.example.com/expired.jpg');

    // Simulate load error
    await act(async () => {
      fireEvent.error(img);
      await Promise.resolve();
    });

    expect(uploadsApi.getAttachmentUrl).toHaveBeenCalledWith('att-123');
    expect(img).toHaveAttribute('src', 'https://cdn.example.com/refreshed.jpg');
  });
});
