import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AudioPlayer } from './audio-player';
import * as uploadsApi from '@/lib/api/uploads';

vi.mock('@/lib/api/uploads', () => ({
  getAttachmentUrl: vi.fn(),
}));

describe('AudioPlayer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.HTMLMediaElement.prototype.play = vi.fn().mockImplementation(() => Promise.resolve());
    window.HTMLMediaElement.prototype.pause = vi.fn();
  });

  it('renders with accessible play button and duration', () => {
    render(<AudioPlayer src="https://cdn.example.com/audio.webm" durationSec={45} />);

    expect(screen.getByRole('button', { name: /play audio/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/audio progress slider/i)).toBeInTheDocument();
    expect(screen.getByText('0:45')).toBeInTheDocument();
  });

  it('toggles play and pause state', () => {
    render(<AudioPlayer src="https://cdn.example.com/audio.webm" durationSec={30} />);

    const button = screen.getByRole('button', { name: /play audio/i });
    fireEvent.click(button);

    const audioElement = document.querySelector('audio');
    expect(audioElement).toBeInTheDocument();

    // Trigger onPlay
    fireEvent.play(audioElement!);
    expect(screen.getByRole('button', { name: /pause audio/i })).toBeInTheDocument();

    // Pause
    fireEvent.click(screen.getByRole('button', { name: /pause audio/i }));
    fireEvent.pause(audioElement!);
    expect(screen.getByRole('button', { name: /play audio/i })).toBeInTheDocument();
  });

  it('updates current time on seek and on timeupdate', () => {
    render(<AudioPlayer src="https://cdn.example.com/audio.webm" durationSec={60} />);

    const slider = screen.getByLabelText(/audio progress slider/i);
    fireEvent.change(slider, { target: { value: '15' } });

    expect(slider).toHaveValue('15');

    const audioElement = document.querySelector('audio');
    Object.defineProperty(audioElement, 'currentTime', { value: 15, writable: true });
    fireEvent.timeUpdate(audioElement!);

    expect(screen.getByText('0:15')).toBeInTheDocument();
  });

  it('resets state when audio ends', () => {
    render(<AudioPlayer src="https://cdn.example.com/audio.webm" durationSec={10} />);

    const audioElement = document.querySelector('audio')!;
    fireEvent.play(audioElement);
    expect(screen.getByRole('button', { name: /pause audio/i })).toBeInTheDocument();

    fireEvent.ended(audioElement);
    expect(screen.getByRole('button', { name: /play audio/i })).toBeInTheDocument();
  });

  it('refreshes expired presigned URL via getAttachmentUrl on audio load error', async () => {
    vi.mocked(uploadsApi.getAttachmentUrl).mockResolvedValue({
      url: 'https://cdn.example.com/refreshed-audio.webm',
      expiresAt: '2026-11-03T12:00:00Z',
    });

    render(
      <AudioPlayer
        src="https://cdn.example.com/expired-audio.webm"
        uploadId="audio-att-1"
        durationSec={15}
      />,
    );

    const audioElement = document.querySelector('audio')!;
    expect(audioElement).toHaveAttribute('src', 'https://cdn.example.com/expired-audio.webm');

    await act(async () => {
      fireEvent.error(audioElement);
      await Promise.resolve();
    });

    expect(uploadsApi.getAttachmentUrl).toHaveBeenCalledWith('audio-att-1');
    expect(audioElement).toHaveAttribute('src', 'https://cdn.example.com/refreshed-audio.webm');
  });
});
