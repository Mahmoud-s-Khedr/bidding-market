import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createEvent, fireEvent, render, screen } from '@testing-library/react';
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

  it('re-emits typing:true on throttle while user continues typing', () => {
    vi.useFakeTimers();
    const handleTyping = vi.fn();
    render(<Composer conversationId="conv-1" onSendMessage={vi.fn()} onTyping={handleTyping} />);

    const textarea = screen.getByPlaceholderText(/type a message/i);

    fireEvent.change(textarea, { target: { value: 'A' } });
    expect(handleTyping).toHaveBeenCalledTimes(1);
    expect(handleTyping).toHaveBeenLastCalledWith(true);

    // Typing again immediately within throttle window does not re-emit
    fireEvent.change(textarea, { target: { value: 'AB' } });
    expect(handleTyping).toHaveBeenCalledTimes(1);

    // Advance past throttle duration (2000ms)
    act(() => {
      vi.advanceTimersByTime(2100);
    });

    // Continuing to type re-emits true
    fireEvent.change(textarea, { target: { value: 'ABC' } });
    expect(handleTyping).toHaveBeenCalledTimes(2);
    expect(handleTyping).toHaveBeenLastCalledWith(true);

    vi.useRealTimers();
  });

  it('emits typing:false when unmounted while typing', () => {
    const handleTyping = vi.fn();
    const { unmount } = render(
      <Composer conversationId="conv-1" onSendMessage={vi.fn()} onTyping={handleTyping} />,
    );

    const textarea = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(textarea, { target: { value: 'Still typing...' } });
    expect(handleTyping).toHaveBeenCalledWith(true);

    unmount();
    expect(handleTyping).toHaveBeenCalledWith(false);
  });

  it('truncates pasted text to 5000 characters limit', () => {
    render(<Composer conversationId="conv-1" onSendMessage={vi.fn()} />);
    const textarea = screen.getByPlaceholderText<HTMLTextAreaElement>(/type a message/i);

    const longText = 'A'.repeat(6000);
    const event = createEvent.paste(textarea, {
      clipboardData: {
        items: [],
        getData: (type: string) => (type === 'text' ? longText : ''),
      },
    });

    fireEvent(textarea, event);
    expect(textarea.value).toHaveLength(5000);
    expect(event.defaultPrevented).toBe(true);
  });

  it('renders character counter with aria-live="polite" when text exceeds 4000 characters', () => {
    render(<Composer conversationId="conv-1" onSendMessage={vi.fn()} />);
    const textarea = screen.getByPlaceholderText(/type a message/i);

    fireEvent.change(textarea, { target: { value: 'x'.repeat(4500) } });

    const counter = screen.getByText('500');
    expect(counter).toBeInTheDocument();
    expect(counter).toHaveAttribute('aria-live', 'polite');
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
