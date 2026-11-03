'use client';

import * as React from 'react';
import { AlertCircle, Check, Mic, Square, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AudioPlayer } from './audio-player';

export interface VoiceRecorderProps {
  onSendVoice: (file: File, durationSec: number) => Promise<void> | void;
  onCancel?: () => void;
  isUploading?: boolean;
  className?: string;
}

function getSupportedMimeType(): { mimeType: string; extension: string } {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return { mimeType: 'audio/webm', extension: 'webm' };
  }

  const types = [
    { mime: 'audio/webm;codecs=opus', ext: 'webm' },
    { mime: 'audio/webm', ext: 'webm' },
    { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
    { mime: 'audio/ogg', ext: 'ogg' },
    { mime: 'audio/mp4', ext: 'mp4' },
  ];

  for (const { mime, ext } of types) {
    if (
      typeof MediaRecorder.isTypeSupported === 'function' &&
      MediaRecorder.isTypeSupported(mime)
    ) {
      return { mimeType: mime, extension: ext };
    }
  }

  return { mimeType: '', extension: 'webm' };
}

function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function VoiceRecorder({
  onSendVoice,
  onCancel,
  isUploading = false,
  className = '',
}: VoiceRecorderProps) {
  const [status, setStatus] = React.useState<'idle' | 'recording' | 'preview'>('idle');
  const [duration, setDuration] = React.useState(0);
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const [audioBlob, setAudioBlob] = React.useState<Blob | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  const cancelledRef = React.useRef(false);
  const mimeConfigRef = React.useRef(getSupportedMimeType());
  const startTimeRef = React.useRef(0);

  // Clean up resources on unmount
  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const cleanupStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = async () => {
    setError(null);
    cancelledRef.current = false;
    chunksRef.current = [];

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeInfo = getSupportedMimeType();
      mimeConfigRef.current = mimeInfo;

      const options = mimeInfo.mimeType ? { mimeType: mimeInfo.mimeType } : undefined;
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        cleanupStream();

        if (cancelledRef.current) {
          chunksRef.current = [];
          setStatus('idle');
          setDuration(0);
          return;
        }

        const type = mimeConfigRef.current.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const url = URL.createObjectURL(blob);

        setAudioBlob(blob);
        setAudioUrl(url);
        setStatus('preview');
      };

      recorder.start(100);
      startTimeRef.current = Date.now();
      setStatus('recording');
      setDuration(0);

      // Start 600s timer
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setDuration(elapsed);

        // Cap at 600 seconds (10 minutes)
        if (elapsed >= 600) {
          stopRecording();
        }
      }, 250);
    } catch (err: unknown) {
      cleanupStream();
      const message =
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
          ? 'Microphone permission denied. Please allow microphone access in your browser.'
          : 'Unable to access microphone. Please check your audio settings.';
      setError(message);
      setStatus('idle');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const cancelRecording = () => {
    cancelledRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      cleanupStream();
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }
      setAudioBlob(null);
      setStatus('idle');
      setDuration(0);
    }
    onCancel?.();
  };

  const handleSend = async () => {
    if (!audioBlob) return;
    const finalDuration = Math.max(1, Math.round(duration));
    const ext = mimeConfigRef.current.extension;
    const file = new File([audioBlob], `voice-note-${Date.now()}.${ext}`, {
      type: audioBlob.type || 'audio/webm',
    });

    try {
      await onSendVoice(file, finalDuration);
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }
      setAudioBlob(null);
      setStatus('idle');
      setDuration(0);
    } catch {
      // Error handled by caller
    }
  };

  if (error) {
    return (
      <div
        className={`flex items-center gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-xs ${className}`}
      >
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span className="flex-1">{error}</span>
        <button
          type="button"
          onClick={() => setError(null)}
          className="hover:opacity-75 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive rounded-xs"
          aria-label="Dismiss error"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  if (status === 'recording') {
    return (
      <div
        className={`flex items-center gap-3 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 animate-pulse ${className}`}
        role="region"
        aria-label="Recording voice note"
      >
        <span className="h-3 w-3 rounded-full bg-destructive animate-ping" />
        <div className="flex items-center gap-1 font-mono text-xs font-semibold text-destructive">
          <span>{formatTimer(duration)}</span>
          <span className="text-muted-foreground font-normal">/ 10:00</span>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={cancelRecording}
            className="h-8 px-2 text-destructive hover:bg-destructive/20"
            aria-label="Cancel recording"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Cancel
          </Button>

          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={stopRecording}
            className="h-8 px-3"
            aria-label="Stop recording and preview"
          >
            <Square className="h-3.5 w-3.5 fill-current mr-1.5" />
            Done
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'preview' && audioUrl) {
    return (
      <div
        className={`flex items-center gap-2.5 p-2 rounded-lg bg-muted/60 border border-border ${className}`}
        role="region"
        aria-label="Preview recorded voice note"
      >
        <div className="flex-1">
          <AudioPlayer src={audioUrl} durationSec={duration} />
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={cancelRecording}
            disabled={isUploading}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            aria-label="Discard recording"
          >
            <Trash2 className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => {
              void handleSend();
            }}
            disabled={isUploading}
            className="h-8 px-3 font-semibold"
            aria-label="Send voice note"
          >
            <Check className="h-4 w-4 mr-1" />
            Send
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => {
        void startRecording();
      }}
      disabled={isUploading}
      aria-label="Record voice note"
      className={`h-9 w-9 p-0 text-muted-foreground hover:text-foreground ${className}`}
    >
      <Mic className="h-5 w-5" />
    </Button>
  );
}
