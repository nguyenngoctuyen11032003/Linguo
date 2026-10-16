import { useEffect, useRef, useState } from 'react';
import { RotateCw, Volume2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { audioUrl } from './exercise-utils';

export interface AudioPlayButtonProps {
  /** Audio asset id or path. Without one there is nothing to play, so no control is rendered at all. */
  path: string | null | undefined;
  className?: string;
  /** Tells the parent when playback failed at runtime (it may show a text fallback), and when a retry clears it. */
  onFailedChange?: (failed: boolean) => void;
}

/**
 * "Nghe" button. A playback failure never disables it: it turns into "Không phát được. Thử lại" and the next
 * press tries again with a fresh audio element.
 */
export function AudioPlayButton({ path, className, onFailedChange }: AudioPlayButtonProps) {
  const [failed, setFailedState] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const changeRef = useRef(onFailedChange);
  useEffect(() => {
    changeRef.current = onFailedChange;
  }, [onFailedChange]);

  const setFailed = (next: boolean) => {
    setFailedState(next);
    changeRef.current?.(next);
  };

  if (!path) return null;

  const play = () => {
    try {
      if (failed) audioRef.current = null;
      audioRef.current ??= new Audio(audioUrl(path));
      audioRef.current.currentTime = 0;
      if (failed) setFailed(false);
      // A browser without a Promise-returning play() resolves nothing to catch.
      void audioRef.current.play()?.catch(() => setFailed(true));
    } catch {
      setFailed(true);
    }
  };

  return (
    <button
      type="button"
      onClick={play}
      className={cn(
        'inline-flex min-h-13 items-center gap-2.5 rounded-2xl px-5 text-[16px] font-bold transition-[translate,box-shadow] duration-150',
        failed ? 'border-2 border-border bg-surface-solid text-text hover:bg-text/5' : 'press-primary bg-primary text-on-primary hover:bg-primary-strong',
        className,
      )}
    >
      {failed ? <RotateCw aria-hidden className="size-5 shrink-0" /> : <Volume2 aria-hidden className="size-5 shrink-0" />}
      {failed ? 'Không phát được. Thử lại' : 'Nghe'}
    </button>
  );
}
