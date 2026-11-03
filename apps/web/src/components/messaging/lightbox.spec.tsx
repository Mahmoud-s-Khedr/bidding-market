import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ImageAttachmentThumbnail, Lightbox } from './lightbox';

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
});
