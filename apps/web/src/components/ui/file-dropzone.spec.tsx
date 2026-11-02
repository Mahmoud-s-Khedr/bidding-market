import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileDropzone } from './file-dropzone';
import * as uploadModule from '@/lib/upload';
import type { Attachment } from '@/lib/api/types';

describe('FileDropzone component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockAttachment: Attachment = {
    id: 'att-1',
    key: 'uploads/pic.png',
    url: 'https://example.com/pic.png',
    fileName: 'pic.png',
    mimeType: 'image/png',
    sizeBytes: 2048,
  };

  it('renders upload dropzone with accessible button and hints', () => {
    render(<FileDropzone purpose="LISTING_IMAGE" label="Upload product photos" />);

    const dropzone = screen.getByRole('button', { name: 'Upload product photos' });
    expect(dropzone).toBeInTheDocument();
    expect(screen.getByText(/Click to upload/i)).toBeInTheDocument();
  });

  it('renders existing attachments with remove buttons', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<FileDropzone purpose="LISTING_IMAGE" value={[mockAttachment]} onChange={onChange} />);

    expect(screen.getByText('pic.png')).toBeInTheDocument();
    expect(screen.getByText('2 KB')).toBeInTheDocument();

    const removeBtn = screen.getByRole('button', { name: /remove pic.png/i });
    await user.click(removeBtn);

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('handles file selection and triggers uploadFile flow', async () => {
    const onChange = vi.fn();
    const uploadedAttachment: Attachment = {
      id: 'att-new',
      key: 'uploads/new.jpg',
      url: 'https://example.com/new.jpg',
      fileName: 'new.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
    };

    vi.spyOn(uploadModule, 'uploadFile').mockResolvedValue(uploadedAttachment);

    const { container } = render(
      <FileDropzone purpose="LISTING_IMAGE" value={[]} onChange={onChange} />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['dummy'], 'new.jpg', { type: 'image/jpeg' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(uploadModule.uploadFile).toHaveBeenCalled();
      expect(onChange).toHaveBeenCalledWith([uploadedAttachment]);
    });
  });

  it('handles drag and drop upload', async () => {
    const onChange = vi.fn();
    const uploadedDoc: Attachment = {
      id: 'att-doc',
      key: 'uploads/doc.pdf',
      url: 'https://example.com/doc.pdf',
      fileName: 'doc.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 4096,
    };

    vi.spyOn(uploadModule, 'uploadFile').mockResolvedValue(uploadedDoc);

    render(<FileDropzone purpose="LISTING_ATTACHMENT" value={[]} onChange={onChange} />);

    const dropzone = screen.getByRole('button');
    const file = new File(['content'], 'doc.pdf', { type: 'application/pdf' });

    fireEvent.dragOver(dropzone);
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(uploadModule.uploadFile).toHaveBeenCalled();
      expect(onChange).toHaveBeenCalledWith([uploadedDoc]);
    });
  });

  it('displays error message when upload fails', async () => {
    vi.spyOn(uploadModule, 'uploadFile').mockRejectedValue(new Error('File exceeds max size'));

    const { container } = render(<FileDropzone purpose="LISTING_IMAGE" value={[]} />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['bad'], 'bad.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('File exceeds max size');
    });
  });

  it('handles concurrent uploads of multiple files without losing files (Finding 6)', async () => {
    const onChange = vi.fn();
    const att1: Attachment = {
      id: 'att-1',
      key: 'key-1',
      fileName: 'file1.png',
      mimeType: 'image/png',
      sizeBytes: 100,
    };
    const att2: Attachment = {
      id: 'att-2',
      key: 'key-2',
      fileName: 'file2.png',
      mimeType: 'image/png',
      sizeBytes: 200,
    };

    let callCount = 0;
    vi.spyOn(uploadModule, 'uploadFile').mockImplementation((file) => {
      callCount++;
      if (file.name === 'file1.png') {
        return Promise.resolve(att1);
      }
      return Promise.resolve(att2);
    });

    const { container } = render(
      <FileDropzone purpose="LISTING_IMAGE" value={[]} onChange={onChange} />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file1 = new File(['1'], 'file1.png', { type: 'image/png' });
    const file2 = new File(['2'], 'file2.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [file1, file2] } });

    await waitFor(() => {
      expect(callCount).toBe(2);
      expect(onChange).toHaveBeenLastCalledWith([att1, att2]);
    });
  });

  it('renders progress bar with progressbar role and aria values (Non-blocking item 4)', async () => {
    let progressCallback: ((percent: number) => void) | undefined;
    vi.spyOn(uploadModule, 'uploadFile').mockImplementation((_file, _purpose, options) => {
      progressCallback = options?.onProgress;
      return new Promise(() => {}); // never resolves to keep in-flight
    });

    const { container } = render(<FileDropzone purpose="LISTING_IMAGE" value={[]} />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['img'], 'progress.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(progressCallback).toBeDefined();
    });

    progressCallback?.(65);

    await waitFor(() => {
      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toBeInTheDocument();
      expect(progressbar).toHaveAttribute('aria-valuenow', '65');
      expect(progressbar).toHaveAttribute('aria-valuemin', '0');
      expect(progressbar).toHaveAttribute('aria-valuemax', '100');
    });
  });

  it('cancels in-flight upload without adding file to onChange (Finding 9)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    let aborted = false;

    vi.spyOn(uploadModule, 'uploadFile').mockImplementation((_file, _purpose, options) => {
      options?.signal?.addEventListener('abort', () => {
        aborted = true;
      });
      return new Promise(() => {}); // pending
    });

    const { container } = render(
      <FileDropzone purpose="LISTING_IMAGE" value={[]} onChange={onChange} />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['test'], 'cancel-me.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('cancel-me.png')).toBeInTheDocument();
    });

    const cancelBtn = screen.getByRole('button', { name: /cancel upload of cancel-me\.png/i });
    await user.click(cancelBtn);

    expect(aborted).toBe(true);
    expect(screen.queryByText('cancel-me.png')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('triggers input click on Enter or Space key', () => {
    const { container } = render(
      <FileDropzone purpose="LISTING_IMAGE" label="Keyboard Dropzone" />,
    );

    const dropzone = screen.getByRole('button', { name: 'Keyboard Dropzone' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');

    fireEvent.keyDown(dropzone, { key: 'Enter' });
    expect(clickSpy).toHaveBeenCalled();

    clickSpy.mockClear();
    fireEvent.keyDown(dropzone, { key: ' ' });
    expect(clickSpy).toHaveBeenCalled();
  });
});
