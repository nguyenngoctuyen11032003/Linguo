import { Library } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { safeUrl } from '@/features/admin/content';
import { useAdminSources } from '@/features/admin/useAdminSources';

const SOURCE_STATUS_LABELS: Record<string, string> = {
  active: 'Đang dùng',
  approved: 'Đã duyệt',
  pending: 'Chờ duyệt',
  draft: 'Nháp',
  retired: 'Ngừng dùng',
  archived: 'Lưu trữ',
};

/** Spec 11 §4 "Nguồn": sources, licenses, attribution requirements and usage (read only). */
export function SourcesPage() {
  const { status, data, error, reload } = useAdminSources();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.02em]">Nguồn và giấy phép</h1>
        <p className="mt-1 text-[15px] text-muted">Nguồn được khai báo trong repo nội dung; trang này chỉ để xem.</p>
      </div>
      {status === 'error' && !data ? (
        <ErrorState description={error ?? undefined} onRetry={reload} />
      ) : !data ? (
        <div role="status" aria-label="Đang tải nguồn" className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={Library} title="Chưa có nguồn" description="Chưa có nguồn nội dung nào được khai báo." />
      ) : (
        <div tabIndex={0} role="region" aria-label="Danh sách nguồn nội dung (cuộn ngang nếu cần)" className="overflow-x-auto rounded-3xl border border-border bg-surface-solid focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40">
          <table className="w-full min-w-[480px] text-left text-[15px]">
            <caption className="px-4 pt-4 text-left font-semibold">Danh sách nguồn nội dung</caption>
            <thead className="text-sm text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Nguồn
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Giấy phép
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Ghi công
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Trạng thái
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Số mục dùng
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((source) => {
                const href = safeUrl(source.url);
                return (
                  <tr key={source.id} className="border-t border-border align-top">
                    <th scope="row" className="px-4 py-3 font-normal">
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 min-w-11 items-center rounded-lg font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40">
                          {source.name}
                        </a>
                      ) : (
                        <span className="font-semibold">{source.name}</span>
                      )}
                      {source.key && <span className="block font-mono text-sm text-muted">{source.key}</span>}
                    </th>
                    <td className="px-4 py-3">{source.license ?? <span className="text-error-text">Chưa khai báo</span>}</td>
                    <td className="px-4 py-3">{source.attribution ?? <span className="text-muted">Không yêu cầu</span>}</td>
                    <td className="px-4 py-3">{SOURCE_STATUS_LABELS[source.status] ?? source.status}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{source.usage_count.toLocaleString('vi-VN')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
