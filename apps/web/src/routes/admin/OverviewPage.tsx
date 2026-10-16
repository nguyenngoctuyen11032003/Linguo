import { AlertTriangle } from 'lucide-react';
import type { AdminContentKind, AdminOverview } from '@linguo/shared';
import { Link } from 'react-router';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { ADMIN_KIND_LABELS_VI } from '@/features/admin/service';
import { useAdminOverview } from '@/features/admin/useAdminOverview';

const fmt = (n: number) => n.toLocaleString('vi-VN');

interface KindRow {
  kind: AdminContentKind;
  total: number;
  published: number;
  other: number;
}

function summarize(overview: AdminOverview) {
  const byKind = new Map<AdminContentKind, KindRow>();
  let total = 0;
  let published = 0;
  for (const row of overview.counts) {
    const entry = byKind.get(row.kind) ?? { kind: row.kind, total: 0, published: 0, other: 0 };
    entry.total += row.count;
    if (row.status === 'published') entry.published += row.count;
    else entry.other += row.count;
    byKind.set(row.kind, entry);
    total += row.count;
    if (row.status === 'published') published += row.count;
  }
  const order = Object.keys(ADMIN_KIND_LABELS_VI) as AdminContentKind[];
  const rows = [...byKind.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return { total, published, rows };
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <SolidCard className="p-4">
      <dt className="text-[13px] leading-snug text-muted">{label}</dt>
      <dd className="stat-num mt-2 text-[40px] leading-none">{value}</dd>
      {hint && <dd className="mt-1 text-sm text-muted">{hint}</dd>}
    </SolidCard>
  );
}

/** Spec 11 §4 "Tổng quan": metric cards, demo / unreviewed warnings and the open report count. */
export function OverviewPage() {
  const { status, data, error, reload } = useAdminOverview();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-[-0.02em]">Tổng quan</h1>
      {status === 'error' && !data ? (
        <ErrorState description={error ?? undefined} onRetry={reload} />
      ) : !data ? (
        <div role="status" aria-label="Đang tải số liệu" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-3xl" />
          ))}
        </div>
      ) : (
        <OverviewContent overview={data} />
      )}
    </div>
  );
}

function OverviewContent({ overview }: { overview: AdminOverview }) {
  const { total, published, rows } = summarize(overview);
  const warnings: string[] = [];
  if (overview.demo_count > 0) warnings.push(`${fmt(overview.demo_count)} mục nội dung demo vẫn đang có trong hệ thống.`);
  if (overview.unreviewed_published_count > 0) {
    warnings.push(`${fmt(overview.unreviewed_published_count)} mục đã duyệt hoặc xuất bản nhưng chưa có người kiểm duyệt.`);
  }

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Tổng số mục nội dung" value={fmt(total)} />
        <Metric label="Đã xuất bản" value={fmt(published)} />
        <Metric label="Nội dung demo" value={fmt(overview.demo_count)} />
        <Metric label="Báo lỗi đang mở" value={fmt(overview.open_report_count)} />
      </dl>

      {warnings.length > 0 && (
        <SolidCard role="note" className="flex gap-3 border-warn/50 p-4">
          <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-warn" />
          <div>
            <h2 className="font-semibold">Cần kiểm duyệt</h2>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[15px] text-muted">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <Link to="/quan-tri/noi-dung" className="mt-2 inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
              Xem danh sách nội dung
            </Link>
          </div>
        </SolidCard>
      )}

      <SolidCard className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-[15px]">
          {overview.open_report_count > 0
            ? `Có ${fmt(overview.open_report_count)} báo lỗi đang chờ xử lý.`
            : 'Không có báo lỗi nào đang chờ xử lý.'}
        </p>
        <Link
          to="/quan-tri/bao-loi"
          className="inline-flex min-h-11 items-center rounded-full border border-border px-4 font-semibold hover:bg-text/5"
        >
          Mở hàng đợi báo lỗi
        </Link>
      </SolidCard>

      <div tabIndex={0} role="region" aria-label="Số lượng theo loại nội dung (cuộn ngang nếu cần)" className="overflow-x-auto rounded-3xl border border-border bg-surface-solid focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40">
        <table className="w-full text-left text-[15px]">
          <caption className="px-4 pt-4 text-left font-semibold">Số lượng theo loại nội dung</caption>
          <thead className="text-sm text-muted">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">
                Loại
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Đã xuất bản
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Trạng thái khác
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Tổng
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-muted">
                  Chưa có nội dung nào.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.kind} className="border-t border-border">
                  <th scope="row" className="px-4 py-2 font-medium">
                    {ADMIN_KIND_LABELS_VI[row.kind]}
                  </th>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(row.published)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(row.other)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(row.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
