'use client';

import * as React from 'react';
import { Pause, Play } from 'lucide-react';
import { getAttachmentUrl } from '@/lib/api/uploads';

export interface AudioPlayerProps {
  src: string;
  uploadId?: string;
  durationSec?: number | null;
  className?: string;
  autoPlay?: boolean;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function AudioPlayer({
  src,
  uploadId,
  durationSec,
  className = '',
  autoPlay = false,
}: AudioPlayerProps) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [currentSrc, setCurrentSrc] = React.useState(src);
  const retriedRef = React.useRef(false);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [totalDuration, setTotalDuration] = React.useState(durationSec || 0);

  React.useEffect(() => {
    setCurrentSrc(src);
    retriedRef.current = false;
  }, [src]);

  React.useEffect(() => {
    if (durationSec) {
      setTotalDuration(durationSec);
    }
  }, [durationSec]);

  const handleError = async () => {
    if (uploadId && !retriedRef.current) {
      retriedRef.current = true;
      try {
        const res = await getAttachmentUrl(uploadId);
        if (res?.url) {
          setCurrentSrc(res.url);
        }
      } catch {
        // Ignore refresh failure
      }
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      void audioRef.current.play().catch(() => {
        setIsPlaying(false);
      });
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current && (!durationSec || isNaN(durationSec))) {
      const dur = audioRef.current.duration;
      if (!isNaN(dur) && isFinite(dur)) {
        setTotalDuration(dur);
      }
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  return (
    <div
      className={`flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card/60 max-w-sm ${className}`}
      role="region"
      aria-label="Voice note player"
    >
      <audio
        ref={audioRef}
        src={currentSrc}
        autoPlay={autoPlay}
        onError={() => {
          void handleError();
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        className="hidden"
        preload="metadata"
      >
        <track kind="captions" />
      </audio>

      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>

      <div className="flex flex-col flex-1 gap-1 min-w-[120px]">
        <input
          type="range"
          min="0"
          max={totalDuration > 0 ? totalDuration : 100}
          step="0.1"
          value={currentTime}
          onChange={handleSeek}
          aria-label="Audio progress slider"
          aria-valuemin={0}
          aria-valuemax={totalDuration}
          aria-valuenow={currentTime}
          aria-valuetext={`${formatTime(currentTime)} of ${formatTime(totalDuration)}`}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground font-mono">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(totalDuration)}</span>
        </div>
      </div>
    </div>
  );
}
