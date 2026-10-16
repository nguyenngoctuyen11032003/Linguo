import { asset } from '@/lib/asset';
import { cn } from '@/lib/cn';

/**
 * Logo mark + condensed display wordmark. `compact` steps the type down on the narrowest phones (< 380px) so the
 * app bar's right-hand controls never touch it.
 */
export function Wordmark({ className, size = 28, compact = false }: { className?: string; size?: number; compact?: boolean }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center', compact ? 'gap-1.5 min-[380px]:gap-2' : 'gap-2', className)}>
      <img src={asset('brand/logo-mark.svg')} alt="" width={size} height={size} style={{ width: size, height: size }} />
      <span
        className={cn(
          'whitespace-nowrap font-display font-extrabold uppercase leading-none tracking-[0.01em]',
          compact ? 'text-[22px] min-[380px]:text-[26px]' : 'text-[26px]',
        )}
      >
        Linguo<span className="text-accent">.</span>
      </span>
    </span>
  );
}
