import { DEFAULT_TIMEZONE, REPORT_REASON_LABELS_VI, type MyReport, type ReportStatus } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { REPORT_STATUS_LABELS_VI, REPORT_TARGET_LABELS_VI } from '@/features/content-reports/labels';
import { useMyReports } from '@/features/content-reports/useMyReports';
import { useProfile } from '@/features/profile/ProfileProvider';
import { cn } from '@/lib/cn';
import { formatDateVi, todayIso } from '@/lib/dates';
import { CollapsibleSection } from './CollapsibleSection';

const STATUS_TONES: Record<ReportStatus, string> = {
  open: 'border-border bg-text/5',
  triaged: 'border-primary/50 bg-primary/10',
  fixed: 'border-success/50 bg-success/10',
  rejected: 'border-border bg-text/5',
  duplicate: 'border-border bg-text/5',
};

function dateOf(iso: string, timeZone: string): string | null {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : formatDateVi(todayIso(timeZone, new Date(ms)));
}

/** Settings "Báo lỗi của tôi" (spec 11 §2): the learner's content reports and how Linguo handled them. */
export function MyReportsSection() {
  const { status, reports, error, reload } = useMyReports();
  const { profile } = useProfile();
  const timeZone = profile?.timezone ?? DEFAULT_TIMEZONE;

  return (
    <CollapsibleSection id="bao-loi" headingId="my-reports-heading" title="Báo lỗi của tôi" contentClassName="space-y-3">
      <p className="text-[15px]">Những lỗi nội dung bạn đã báo và cách Linguo xử lý. Cảm ơn bạn đã giúp bài học tốt hơn.</p>
      {status === 'loading' && (
        <div role="status" className="space-y-2">
          <span className="sr-only">Đang tải báo lỗi…</span>
          <Skeleton className="block h-16 w-full rounded-2xl" />
          <Skeleton className="block h-16 w-full rounded-2xl" />
        </div>
      )}
      {status === 'error' && (
        <div role="alert" className="space-y-2">
          <p className="text-[15px] text-error-text">{error ?? 'Không tải được danh sách báo lỗi.'}</p>
          <Button variant="ghost" onClick={reload}>
            Thử lại
          </Button>
        </div>
      )}
      {status === 'ready' && reports.length === 0 && (
        <p className="text-[15px] text-muted" data-testid="my-reports-empty">
          Bạn chưa gửi báo lỗi nào. Khi thấy nội dung sai, hãy bấm “Báo lỗi nội dung” ngay trong bài học hoặc thẻ ôn.
        </p>
      )}
      {status === 'ready' && reports.length > 0 && (
        <ul className="space-y-2">
          {reports.map((report) => (
            <ReportRow key={report.id} report={report} timeZone={timeZone} />
          ))}
        </ul>
      )}
    </CollapsibleSection>
  );
}

function ReportRow({ report, timeZone }: { report: MyReport; timeZone: string }) {
  const created = dateOf(report.created_at, timeZone);
  return (
    <li className="min-w-0 rounded-2xl border border-border p-3 break-words">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-muted">{REPORT_TARGET_LABELS_VI[report.target_kind]}</span>
          <span className="block text-[16px] font-semibold">{report.target_label ?? 'Nội dung không còn hiển thị'}</span>
        </p>
        <span
          data-testid="report-status"
          className={cn('inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-sm font-semibold', STATUS_TONES[report.status])}
        >
          {REPORT_STATUS_LABELS_VI[report.status]}
        </span>
      </div>
      <p className="mt-1 text-[15px]">
        {REPORT_REASON_LABELS_VI[report.reason]}
        {created && <span className="text-muted"> · {created}</span>}
      </p>
      {report.note && <p className="mt-1 text-[15px] text-muted">Ghi chú: {report.note}</p>}
      {report.resolution_note && (
        <p className="mt-2 rounded-xl bg-text/5 px-3 py-2 text-[15px]">
          <span className="font-semibold">Phản hồi từ Linguo: </span>
          {report.resolution_note}
        </p>
      )}
    </li>
  );
}
