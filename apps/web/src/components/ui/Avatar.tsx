import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

interface AvatarProps {
  /** Public image URL; falls back to the initial when missing or when it fails to load. */
  src?: string | null;
  initial: string;
  /** Tailwind size classes for the outer ring, e.g. `size-11`. */
  className?: string;
  initialClassName?: string;
}

/** Gradient-ringed round avatar used by the app bar and settings. Decorative: the parent control carries the label. */
export function Avatar({ src, initial, className, initialClassName }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex shrink-0 rounded-full bg-[conic-gradient(from_200deg,var(--primary),var(--accent),var(--primary))] p-[2px]', className)}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          width={256}
          height={256}
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="size-full rounded-full bg-surface-solid object-cover"
        />
      ) : (
        <span className={cn('inline-flex size-full items-center justify-center rounded-full bg-surface-solid font-extrabold', initialClassName)}>{initial}</span>
      )}
    </span>
  );
}
