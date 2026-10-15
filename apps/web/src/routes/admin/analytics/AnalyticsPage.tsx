import { useId, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { ADMIN_ANALYTICS_RANGES, type AdminAnalytics as AdminAnalyticsData, type AdminAnalyticsRange } from '@linguo/shared';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { analyticsTotals, formatCount, parseAnalyticsRange } from '@/features/admin/analytics';
import { useAdminAnalytics } from '@/features/admin/useAdminAnalytics';
import { cn } from '@/lib/cn';
import { AiUsagePanel, Stat } from './AiUsagePanel';
import { DailyChart } from './DailyChart';
import { FunnelChart } from './FunnelChart';

/**
 * /quan-tri/thong-ke (spec 11 §4): usage, funnel and AI usage — aggregates only. Admin only: the route wraps it in
 * `AdminGuard minRole="admin"` and the RPCs refuse other roles.
 */
export function AnalyticsPage() {
  return (
    <div className="min-w-0 space-y-5">
      <header>
        <h1 className="text-[26px] font-bold tracking-[-0.03em]">Thống kê</h1>
        <p className="mt-1 text-[15px] text-muted">Chỉ số tổng hợp, không chứa thông tin của từng người dùng.</p>
      </header>
      <AnalyticsContent />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="min-w-0">
      <SolidCard className="min-w-0 space-y-4">
        <h2 id={id} className="text-lg font-bold">
          {title}
        </h2>
        {children}
      </SolidCard>
    </section>
  );
}

function AnalyticsContent() {
  const [params, setParams] = useSearchParams();
  const range = parseAnalyticsRange(params.get('ngay'));
  const state = useAdminAnalytics(range);

  const pick = (next: AdminAnalyticsRange) => {
    if (next === range) return;
    setParams(next === 28 ? {} : { ngay: String(next) }, { replace: true });
  };

  return (
    <>
      <div role="group" aria-label="Khoảng thời gian" className="inline-flex rounded-full border border-border bg-surface-solid p-1">
        {ADMIN_ANALYTICS_RANGES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={r === range}
            onClick={() => pick(r)}
            className={cn(
              'min-h-11 rounded-full px-4 text-[15px] font-semibold transition-colors',
              r === range ? 'bg-primary text-on-primary' : 'text-muted hover:bg-text/5 hover:text-text',
            )}
          >
            {r} ngày
          </button>
        ))}
      </div>

      {state.status === 'error' ? (
        <ErrorState title="Không tải được thống kê" description={state.error ?? undefined} onRetry={state.reload} />
      ) : !state.data ? (
        <div className="space-y-3" aria-busy="true">
          <p role="status" className="sr-only">
            Đang tải thống kê…
          </p>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-52 w-full" />
        </div>
      ) : (
        <AnalyticsBody data={state.data} loading={state.status === 'loading'} />
      )}
    </>
  );
}

const KIND_LABELS: Record<string, string> = {
  render_error: 'Lỗi hiển thị',
  unhandled_rejection: 'Promise bị từ chối',
  window_error: 'Lỗi trình duyệt',
  chunk_load_error: 'Không tải được mã trang',
  rpc_error: 'Lỗi máy chủ',
};

function ClientErrorsTable({ errors }: { errors: AdminAnalyticsData['client_errors'] }) {
  if (errors.total === 0) return <p className="text-[15px] text-muted">Chưa có lỗi nào được báo cáo trong khoảng thời gian này.</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {formatCount(errors.total)} báo cáo ẩn danh (loại lỗi và đường dẫn dạng mẫu, không có nội dung người dùng).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-[15px]">
          <caption className="sr-only">Lỗi phía người dùng theo loại và màn hình, tối đa 10 dòng</caption>
          <thead>
            <tr className="border-b border-border text-sm text-muted">
              <th scope="col" className="py-2 pr-3 font-semibold">Loại lỗi</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Màn hình</th>
              <th scope="col" className="py-2 text-right font-semibold">Số lần</th>
            </tr>
          </thead>
          <tbody>
            {errors.top.map((row) => (
              <tr key={`${row.kind}|${row.route ?? ''}`}className="border-b border-border/60">
                <td className="py-2 pr-3">{KIND_LABELS[row.kind] ?? row.kind}</td>
                <td className="break-all py-2 pr-3 font-mono text-sm">{row.route ?? '—'}</td>
                <td className="py-2 text-right tabular-nums">{formatCount(row.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnalyticsBody({ data, loading }: { data: NonNullable<ReturnType<typeof useAdminAnalytics>['data']>; loading: boolean }) {
  const { analytics, aiUsage } = data;
  const totals = analyticsTotals(analytics.daily);
  return (
    <div className={cn('space-y-5', loading && 'opacity-60')} aria-busy={loading || undefined}>
      <p className="text-sm text-muted">Số liệu {analytics.days} ngày gần nhất.</p>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat term="Người dùng tuần (WAU)" value={formatCount(analytics.wau)} />
        <Stat term="DAU cao nhất" value={formatCount(totals.peakDau)} />
        <Stat term="Hoàn thành onboarding" value={formatCount(analytics.onboarding_completed)} />
        <Stat term="Bài học hoàn thành" value={formatCount(totals.lessons)} />
        <Stat term="Phiên ôn tập" value={formatCount(totals.reviews)} />
        <Stat term="Lượt thi thử" value={formatCount(totals.exams)} />
      </dl>

      <Section title="Người dùng hoạt động mỗi ngày">
        <DailyChart daily={analytics.daily} />
      </Section>

      <Section title="Phễu người dùng mới">
        <FunnelChart funnel={analytics.funnel} />
      </Section>

      <Section title="Lỗi phía người dùng">
        <ClientErrorsTable errors={analytics.client_errors} />
      </Section>

      <Section title="Mức dùng AI">
        <AiUsagePanel usage={aiUsage} />
      </Section>
    </div>
  );
}
