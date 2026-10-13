import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { SolidCard } from './SolidCard';

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({
  title = 'Không tải được dữ liệu',
  description = 'Đã có lỗi xảy ra. Kiểm tra kết nối mạng rồi thử lại.',
  onRetry,
  retryLabel = 'Thử lại',
}: ErrorStateProps) {
  return (
    <SolidCard role="alert" className="flex flex-col items-center gap-3 px-6 py-8 text-center">
      <AlertTriangle aria-hidden className="size-8 text-error" />
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="max-w-sm text-[15px] text-muted">{description}</p>
      {onRetry && (
        <Button variant="ghost" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </SolidCard>
  );
}
