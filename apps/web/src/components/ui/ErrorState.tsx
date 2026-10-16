import { RotateCw } from 'lucide-react';
import { Button } from './Button';
import { SolidCard } from './SolidCard';
import { RouteIllustration } from '@/components/feedback/RouteIllustration';
import { GENERIC_ERROR_MESSAGE } from '@/lib/error-fallback';

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  headingLevel?: 'h2' | 'h3';
}

export function ErrorState({
  title = 'Không tải được dữ liệu',
  description = GENERIC_ERROR_MESSAGE,
  onRetry,
  retryLabel = 'Thử lại',
  headingLevel = 'h2',
}: ErrorStateProps) {
  const Heading = headingLevel;
  return (
    <SolidCard role="alert" className="relative isolate flex flex-col items-center gap-3 overflow-hidden px-6 pb-8 pt-6 text-center">
      <span aria-hidden="true" className="pointer-events-none absolute -top-24 left-1/2 -z-10 size-60 -translate-x-1/2 rounded-full bg-error/12 blur-3xl" />
      <RouteIllustration variant="broken" className="w-44 max-w-full" />
      <Heading className="text-lg font-extrabold tracking-[-0.01em] text-balance">{title}</Heading>
      <p className="max-w-sm text-pretty text-[15px] leading-relaxed text-muted">{description}</p>
      {onRetry && (
        <Button variant="primary" onClick={onRetry} className="mt-1 min-w-36">
          <RotateCw aria-hidden className="size-4" />
          {retryLabel}
        </Button>
      )}
    </SolidCard>
  );
}
