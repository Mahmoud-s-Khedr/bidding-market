import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Composer } from './composer';
import * as uploadModule from '@/lib/upload';
import { makeAttachment } from '../../../test/fixtures';

vi.mock('@/lib/upload', () => ({
  uploadFile: vi.fn(),
}));

describe('Composer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:preview-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('sends text on Enter and creates newline on Shift+Enter', () => {
    const handleSend = vi.fn().mockResolvedValue(undefined);
    render(<Composer conversationId="conv-1" onSendMessage={handleSend} />);

    const textarea = screen.getByPlaceholderText(/type a message/i);

    // Shift + Enter should NOT send
    fireEvent.change(textarea, { target: { value: 'First line' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(handleSend).not.toHaveBeenCalled();

    // Enter without Shift should send
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(handleSend).toHaveBeenCalledWith({
      type: 'TEXT',
      body: 'First line',
      attachmentIds: [],
      attachments: [],
    });
  });

  it('emits typing on change and stops typing on blur', () => {
    const handleTyping = vi.fn();
    render(<Composer conversationId="conv-1" onSendMessage={vi.fn()} onTyping={handleTyping} />);

    const textarea = screen.getByPlaceholderText(/type a message/i);

    fireEvent.change(textarea, { target: { value: 'Hello' } });
    expect(handleTyping).toHaveBeenCalledWith(true);

    fireEvent.blur(textarea);
    expect(handleTyping).toHaveBeenCalledWith(false);
  });

  it('handles attachment upload and includes attachments in payload', async () => {
    const mockUpload = makeAttachment({
      id: 'att-uploaded-1',
      fileName: 'photo.png',
      mimeType: 'image/png',
    });
    vi.mocked(uploadModule.uploadFile).mockResolvedValue(mockUpload);

    const handleSend = vi.fn().mockResolvedValue(undefined);
    render(<Composer conversationId="conv-1" onSendMessage={handleSend} />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const testFile = new File(['image-content'], 'photo.png', { type: 'image/png' });

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [testFile] } });
      await Promise.resolve();
    });

    expect(uploadModule.uploadFile).toHaveBeenCalledWith(
      testFile,
      'MESSAGE_ATTACHMENT',
      expect.any(Object),
    );

    expect(await screen.findByText('photo.png')).toBeInTheDocument();

    // Send button should now be enabled
    const sendButton = screen.getByRole('button', { name: /send message/i });
    expect(sendButton).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(sendButton);
      await Promise.resolve();
    });

    expect(handleSend).toHaveBeenCalledWith({
      type: 'IMAGE',
      body: undefined,
      attachmentIds: ['att-uploaded-1'],
      attachments: [expect.objectContaining({ id: 'att-uploaded-1' })],
    });
  });

  it('handles pasting a screenshot image from the clipboard', async () => {
    const mockUpload = makeAttachment({
      id: 'att-screenshot',
      fileName: 'screenshot.png',
      mimeType: 'image/png',
    });
    vi.mocked(uploadModule.uploadFile).mockResolvedValue(mockUpload);

    render(<Composer conversationId="conv-1" onSendMessage={vi.fn()} />);

    const textarea = screen.getByPlaceholderText(/type a message/i);
    const pasteFile = new File(['dummy-bytes'], 'screenshot.png', { type: 'image/png' });

    const pasteEvent = {
      clipboardData: {
        items: [
          {
            type: 'image/png',
            getAsFile: () => pasteFile,
          },
        ],
      },
      preventDefault: vi.fn(),
    };

    await act(async () => {
      fireEvent.paste(textarea, pasteEvent);
      await Promise.resolve();
    });

    expect(uploadModule.uploadFile).toHaveBeenCalledWith(
      pasteFile,
      'MESSAGE_ATTACHMENT',
      expect.any(Object),
    );
  });
});
