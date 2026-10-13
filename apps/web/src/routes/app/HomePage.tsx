import { Route } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useProfile } from '@/features/profile/ProfileProvider';

const todayLabel = () => new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

export function HomePage() {
  const { status, profile, reload } = useProfile();
  const name = profile?.displayName.trim();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm capitalize text-muted">{todayLabel()}</p>
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
          {status === 'loading' ? (
            <>
              <span className="sr-only">Đang tải…</span>
              <Skeleton className="h-8 w-52 align-middle" />
            </>
          ) : (
            `Chào ${name || 'bạn'}`
          )}
        </h1>
      </header>

      {status === 'error' && <ErrorState title="Không tải được hồ sơ" onRetry={reload} />}

      <EmptyState
        icon={Route}
        title="Bắt đầu lộ trình đầu tiên"
        description="Chọn ngôn ngữ, mục tiêu và thời gian học mỗi ngày. Linguo sẽ lập kế hoạch và điều chỉnh theo kết quả thật của bạn."
        action={
          <Button variant="accent" size="lg" disabled aria-describedby="onboarding-soon">
            Tạo lộ trình
          </Button>
        }
        footnote={<span id="onboarding-soon">Sắp ra mắt trong bản cập nhật tới.</span>}
      />
    </div>
  );
}
