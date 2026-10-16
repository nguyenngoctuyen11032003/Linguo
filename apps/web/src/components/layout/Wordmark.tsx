import { asset } from '@/lib/asset';
import { cn } from '@/lib/cn';

/** Logo mark + condensed display wordmark. */
export function Wordmark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <img src={asset('brand/logo-mark.svg')} alt="" width={size} height={size} style={{ width: size, height: size }} />
      <span className="font-display text-[26px] font-extrabold uppercase leading-none tracking-[0.01em]">
        Linguo<span className="text-accent">.</span>
      </span>
    </span>
  );
}
