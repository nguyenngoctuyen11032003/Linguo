import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { SolidCard } from './SolidCard';
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
    <SolidCard role="alert" className="flex flex-col items-center gap-3 px-6 py-8 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-error/12 text-error ring-1 ring-error/25 ring-inset">
        <AlertTriangle aria-hidden className="size-7" />
      </span>
      <Heading className="text-lg font-extrabold tracking-[-0.01em]">{title}</Heading>
      <p className="max-w-sm text-[15px] text-muted">{description}</p>
      {onRetry && (
        <Button variant="ghost" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </SolidCard>
  );
}
