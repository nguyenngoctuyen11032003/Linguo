import { Spinner } from '@/components/ui/Spinner';

export function FullScreenLoader({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div role="status" className="flex min-h-hero items-center justify-center gap-3 text-muted">
      <Spinner className="size-6 text-primary" />
      <span>{label}</span>
    </div>
  );
}
