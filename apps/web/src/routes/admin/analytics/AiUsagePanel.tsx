import type { AdminAiUsage } from '@linguo/shared';
import {
  AI_REPORT_REASON_LABELS_VI,
  AI_STATUS_LABELS_VI,
  AI_TASK_LABELS_VI,
  aiTaskTable,
  formatCount,
  formatMs,
  formatShare,
  labelOr,
} from '@/features/admin/analytics';

/** AI usage: requests by task × status, cache hit rate, latency and AI answer reports (aggregates only). */
export function AiUsagePanel({ usage }: { usage: AdminAiUsage }) {
  const { statuses, rows } = aiTaskTable(usage.by_task);
  const reasons = Object.entries(usage.reports_by_reason).sort(([, a], [, b]) => b - a);
  const totalRequests = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat term="Tổng request" value={formatCount(totalRequests)} />
        <Stat term="Tỉ lệ dùng cache" value={formatShare(usage.cache_hit_rate)} />
        <Stat term="Độ trễ p50" value={formatMs(usage.latency_p50_ms)} />
        <Stat term="Độ trễ p95" value={formatMs(usage.latency_p95_ms)} />
      </dl>

      {rows.length === 0 ? (
        <p className="text-[15px] text-muted">Chưa có request AI nào trong khoảng này.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[480px] text-left text-[15px]">
            <caption className="sr-only">Số request AI theo tác vụ và trạng thái</caption>
            <thead className="border-b border-border text-sm text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-semibold">
                  Tác vụ
                </th>
                {statuses.map((s) => (
                  <th key={s} scope="col" className="px-3 py-2 text-right font-semibold">
                    {labelOr(AI_STATUS_LABELS_VI, s)}
                  </th>
                ))}
                <th scope="col" className="px-4 py-2 text-right font-semibold">
                  Tổng
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.task} className="border-b border-border last:border-0">
                  <th scope="row" className="px-4 py-2 font-semibold">
                    {labelOr(AI_TASK_LABELS_VI, row.task)}
                  </th>
                  {statuses.map((s) => (
                    <td key={s} className="px-3 py-2 text-right tabular-nums">
                      {formatCount(row.byStatus[s] ?? 0)}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatCount(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-[15px] font-bold">Báo lỗi câu trả lời AI theo lý do</h3>
        {reasons.length === 0 ? (
          <p className="text-[15px] text-muted">Không có báo lỗi nào.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {reasons.map(([reason, count]) => (
              <li key={reason} className="rounded-full border border-border px-3 py-1 text-[15px]">
                {labelOr(AI_REPORT_REASON_LABELS_VI, reason)}: <strong className="tabular-nums">{formatCount(count)}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function Stat({ term, value }: { term: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-solid px-4 py-3">
      <dt className="text-sm text-muted">{term}</dt>
      <dd className="text-xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}
