import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

interface AvatarProps {
  /** Public image URL; falls back to the initial when missing or when it fails to load (after one retry). */
  src?: string | null;
  initial: string;
  /** Tailwind size classes for the outer ring, e.g. `size-11`. */
  className?: string;
  initialClassName?: string;
}

/** A flaky mobile connection often fails the first image request: wait a moment, then ask once more. */
export const AVATAR_RETRY_DELAY_MS = 1500;

/** Same image, new URL: a failed response may sit in the HTTP cache (and blob: URLs take no query). */
function withRetryParam(src: string): string {
  if (src.startsWith('blob:') || src.startsWith('data:')) return src;
  return `${src}${src.includes('?') ? '&' : '?'}r=1`;
}

/** Gradient-ringed round avatar used by the app bar and settings. Decorative: the parent control carries the label. */
export function Avatar({ src, initial, className, initialClassName }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const [retried, setRetried] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    setFailed(false);
    setRetried(false);
    setRetrying(false);
  }, [src]);

  useEffect(() => {
    if (!retrying) return;
    const timer = window.setTimeout(() => {
      setRetrying(false);
      setRetried(true);
    }, AVATAR_RETRY_DELAY_MS);
    // Back online: no need to wait the rest of the delay.
    const onOnline = () => {
      window.clearTimeout(timer);
      setRetrying(false);
      setRetried(true);
    };
    window.addEventListener('online', onOnline, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('online', onOnline);
    };
  }, [retrying]);

  function onError() {
    if (retried || retrying) {
      setRetrying(false);
      setFailed(true);
    } else setRetrying(true);
  }

  const shown = src && retried && !failed ? withRetryParam(src) : src;
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex shrink-0 rounded-full bg-[conic-gradient(from_200deg,var(--primary),var(--accent),var(--primary))] p-[2px]', className)}
    >
      {src && !failed && !retrying ? (
        <img
          key={retried ? 'retry' : 'first'}
          src={shown ?? undefined}
          alt=""
          width={256}
          height={256}
          decoding="async"
          draggable={false}
          onError={onError}
          className="size-full rounded-full bg-surface-solid object-cover"
        />
      ) : (
        <span className={cn('inline-flex size-full items-center justify-center rounded-full bg-surface-solid font-extrabold', initialClassName)}>{initial}</span>
      )}
    </span>
  );
}
