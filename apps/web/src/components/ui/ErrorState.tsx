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
      <AlertTriangle aria-hidden className="size-8 text-error" />
      <Heading className="text-lg font-bold">{title}</Heading>
      <p className="max-w-sm text-[15px] text-muted">{description}</p>
      {onRetry && (
        <Button variant="ghost" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </SolidCard>
  );
}
