import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { VoiceRecorder } from './voice-recorder';

class MockMediaRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  stream: MediaStream;
  options?: MediaRecorderOptions;

  static isTypeSupported = vi.fn().mockImplementation((type: string) => {
    return type.includes('webm');
  });

  constructor(stream: MediaStream, options?: MediaRecorderOptions) {
    this.stream = stream;
    this.options = options;
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    if (this.ondataavailable) {
      this.ondataavailable({
        data: new Blob(['mock-audio-bytes'], { type: 'audio/webm' }),
      });
    }
    if (this.onstop) {
      this.onstop();
    }
  }
}

describe('VoiceRecorder', () => {
  let mockTracks: { stop: ReturnType<typeof vi.fn> }[];
  let mockStream: MediaStream;
  let getUserMediaMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();

    mockTracks = [{ stop: vi.fn() }];
    mockStream = {
      getTracks: vi.fn().mockReturnValue(mockTracks),
    } as unknown as MediaStream;

    getUserMediaMock = vi.fn().mockResolvedValue(mockStream);

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: getUserMediaMock,
      },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window, 'MediaRecorder', {
      value: MockMediaRecorder,
      writable: true,
      configurable: true,
    });

    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-audio-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records audio, shows preview, and submits payload with duration', async () => {
    const handleSend = vi.fn<(file: File, durationSec: number) => Promise<void> | void>();
    render(<VoiceRecorder onSendVoice={handleSend} />);

    const recordButton = screen.getByRole('button', { name: /record voice note/i });
    expect(recordButton).toBeInTheDocument();

    // Start recording
    await act(async () => {
      fireEvent.click(recordButton);
      await Promise.resolve();
    });

    expect(getUserMediaMock).toHaveBeenCalledWith({ audio: true });
    expect(screen.getByRole('region', { name: /recording voice note/i })).toBeInTheDocument();

    // Advance timer by 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText('0:05')).toBeInTheDocument();

    // Stop recording to preview
    const doneButton = screen.getByRole('button', { name: /stop recording and preview/i });
    act(() => {
      fireEvent.click(doneButton);
    });

    expect(
      screen.getByRole('region', { name: /preview recorded voice note/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send voice note/i })).toBeInTheDocument();

    // Send voice note
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send voice note/i }));
      await Promise.resolve();
    });

    expect(handleSend).toHaveBeenCalledTimes(1);
    const firstCall = handleSend.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [sentFile, sentDuration] = firstCall!;
    expect(sentFile).toBeInstanceOf(File);
    expect(sentFile.name).toMatch(/voice-note-.*\.webm/);
    expect(sentDuration).toBe(5);
  });

  it('caps recording automatically at 600 seconds', async () => {
    const handleSend = vi.fn();
    render(<VoiceRecorder onSendVoice={handleSend} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /record voice note/i }));
      await Promise.resolve();
    });

    // Advance timer to 600s
    act(() => {
      vi.advanceTimersByTime(600_000);
    });

    // Should transition to preview
    expect(
      screen.getByRole('region', { name: /preview recorded voice note/i }),
    ).toBeInTheDocument();
  });

  it('cancels recording and stops media tracks without sending', async () => {
    const handleSend = vi.fn();
    const handleCancel = vi.fn();
    render(<VoiceRecorder onSendVoice={handleSend} onCancel={handleCancel} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /record voice note/i }));
      await Promise.resolve();
    });

    const cancelButton = screen.getByRole('button', { name: /cancel recording/i });
    act(() => {
      fireEvent.click(cancelButton);
    });

    expect(handleCancel).toHaveBeenCalled();
    expect(mockTracks[0]?.stop).toHaveBeenCalled();
    expect(handleSend).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /record voice note/i })).toBeInTheDocument();
  });

  it('handles permission denied gracefully', async () => {
    const permissionError = new DOMException('Permission denied', 'NotAllowedError');
    getUserMediaMock.mockRejectedValue(permissionError);

    render(<VoiceRecorder onSendVoice={vi.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /record voice note/i }));
      await Promise.resolve();
    });

    expect(screen.getByText(/microphone permission denied/i)).toBeInTheDocument();
  });
});
