import { useId, useMemo, useState, type FormEvent } from 'react';
import {
  REPORT_REASON_LABELS_VI,
  REPORT_RULES,
  REPORT_STATUSES,
  REPORT_TARGET_KINDS,
  type AdminReportGroup,
  type ReportReason,
  type ReportStatus,
  type ReportTargetKind,
} from '@linguo/shared';
import { Flag } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { inputClasses } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  ADMIN_REPORT_PAGE_SIZE,
  REPORT_RESOLVE_STATUSES,
  REPORT_STATUS_LABELS_VI,
  REPORT_TARGET_LABELS_VI,
  adminContentPath,
  type ReportResolveStatus,
} from '@/features/admin/service';
import { useAdminReports } from '@/features/admin/useAdminReports';
import { cn } from '@/lib/cn';

const NOTE_MAX = REPORT_RULES.resolution_note_max;

const RESOLVE_LABELS: Record<ReportResolveStatus, string> = {
  fixed: 'Đã sửa',
  rejected: 'Không phải lỗi',
  duplicate: 'Trùng lặp',
  triaged: 'Đã tiếp nhận',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const groupKey = (g: AdminReportGroup) => `${g.target_kind}:${g.target_id}`;
const reasonLabel = (reason: string) => REPORT_REASON_LABELS_VI[reason as ReportReason] ?? reason;
const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
};
const selectClasses = cn(inputClasses(false), 'min-h-11 appearance-none py-2 pr-8 text-[15px]');

/** Spec 11 §4 "Báo lỗi": the queue grouped by target, filtered, paged, resolved in bulk with a note. */
export function ReportsPage() {
  const [status, setStatus] = useState<ReportStatus | null>('open');
  const [params, setParams] = useSearchParams();
  // ?loai=<kind> pre-filters the queue (link from a content detail page).
  const [kind, setKind] = useState<ReportTargetKind | null>(() => {
    const initial = params.get('loai');
    return (REPORT_TARGET_KINDS as readonly string[]).includes(initial ?? '') ? (initial as ReportTargetKind) : null;
  });
  // ?muc=<id> (with ?loai) narrows it to one content row ("Mở báo lỗi của nội dung này").
  const itemParam = params.get('muc');
  const targetId = kind && itemParam && UUID.test(itemParam) ? itemParam : null;
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [action, setAction] = useState<ReportResolveStatus>('fixed');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const reports = useAdminReports({ status, kind, page: targetId ? 0 : page, targetId });

  const clearItem = () => {
    if (!params.has('muc')) return;
    const next = new URLSearchParams(params);
    next.delete('muc');
    setParams(next, { replace: true });
  };
  const ids = useId();

  const groups = useMemo(() => reports.data?.groups ?? [], [reports.data]);
  const totalGroups = reports.data?.total_groups ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalGroups / ADMIN_REPORT_PAGE_SIZE));
  const selectedGroups = groups.filter((g) => selected.has(groupKey(g)));
  const selectedReportIds = selectedGroups.flatMap((g) => g.reports.map((r) => r.id));
  const allSelected = groups.length > 0 && selectedGroups.length === groups.length;

  const resetView = () => {
    setSelected(new Set());
    setMessage(null);
    setFailure(null);
  };

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(groups.map(groupKey)));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (selectedReportIds.length === 0 || reports.resolving) return;
    setMessage(null);
    setFailure(null);
    try {
      const updated = await reports.resolve(selectedReportIds, action, note);
      setSelected(new Set());
      setNote('');
      setMessage(`Đã đánh dấu ${updated} báo lỗi là "${RESOLVE_LABELS[action]}".`);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Đã có lỗi xảy ra. Vui lòng thử lại.');
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-[-0.02em]">Báo lỗi nội dung</h1>

      <div className="flex flex-wrap gap-3">
        <div className="min-w-44">
          <label htmlFor={`${ids}-status`} className="mb-1 block text-sm font-semibold">
            Trạng thái
          </label>
          <select
            id={`${ids}-status`}
            value={status ?? ''}
            onChange={(e) => {
              setStatus((e.target.value || null) as ReportStatus | null);
              setPage(0);
              resetView();
            }}
            className={selectClasses}
          >
            <option value="">Tất cả</option>
            {REPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {REPORT_STATUS_LABELS_VI[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-52">
          <label htmlFor={`${ids}-kind`} className="mb-1 block text-sm font-semibold">
            Loại nội dung
          </label>
          <select
            id={`${ids}-kind`}
            value={kind ?? ''}
            onChange={(e) => {
              setKind((e.target.value || null) as ReportTargetKind | null);
              setPage(0);
              resetView();
              clearItem();
            }}
            className={selectClasses}
          >
            <option value="">Tất cả</option>
            {REPORT_TARGET_KINDS.map((k) => (
              <option key={k} value={k}>
                {REPORT_TARGET_LABELS_VI[k]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {targetId && kind && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-border bg-surface-solid px-4 py-2 text-[15px]">
          <span>
            Chỉ hiện báo lỗi của một nội dung ({REPORT_TARGET_LABELS_VI[kind]}).{' '}
            <Link to={adminContentPath(kind, targetId)} className="font-semibold text-primary underline-offset-4 hover:underline">
              Xem nội dung
            </Link>
          </span>
          <button
            type="button"
            onClick={() => {
              resetView();
              clearItem();
            }}
            className="min-h-11 font-semibold text-primary underline underline-offset-4"
          >
            Xem cả hàng đợi
          </button>
        </p>
      )}

      <form onSubmit={submit} aria-labelledby={`${ids}-action-title`} className="rounded-3xl border border-border bg-surface-solid p-4">
        <h2 id={`${ids}-action-title`} className="font-semibold">
          Xử lý báo lỗi đã chọn
        </h2>
        <p className="mt-1 text-sm text-muted" aria-live="polite">
          {selectedReportIds.length > 0
            ? `Đã chọn ${selectedGroups.length} nội dung (${selectedReportIds.length} báo lỗi).`
            : 'Chọn một hoặc nhiều nội dung trong bảng bên dưới.'}
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-[12rem_minmax(0,1fr)]">
          <div>
            <label htmlFor={`${ids}-action`} className="mb-1 block text-sm font-semibold">
              Đánh dấu là
            </label>
            <select id={`${ids}-action`} value={action} onChange={(e) => setAction(e.target.value as ReportResolveStatus)} className={selectClasses}>
              {REPORT_RESOLVE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {RESOLVE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${ids}-note`} className="mb-1 block text-sm font-semibold">
              Ghi chú xử lý (người báo lỗi sẽ thấy)
            </label>
            <textarea
              id={`${ids}-note`}
              value={note}
              rows={2}
              maxLength={NOTE_MAX}
              aria-describedby={`${ids}-note-count`}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
              placeholder="Ví dụ: đã sửa đáp án trong bản 3."
              className="block w-full resize-y rounded-2xl border border-border bg-surface-solid px-4 py-2 text-base text-text placeholder:text-muted focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/45"
            />
            <p id={`${ids}-note-count`} className={cn('mt-1 text-right text-sm text-muted', note.length >= NOTE_MAX && 'text-error-text')}>
              {note.length}/{NOTE_MAX}
            </p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" loading={reports.resolving} disabled={selectedReportIds.length === 0}>
            {selectedReportIds.length > 0 ? `Áp dụng cho ${selectedReportIds.length} báo lỗi` : 'Áp dụng'}
          </Button>
          <p role="status" className="text-sm text-success-text">
            {message}
          </p>
        </div>
        {failure && (
          <p role="alert" className="mt-2 text-sm text-error-text">
            {failure}
          </p>
        )}
      </form>

      {reports.status === 'error' && !reports.data ? (
        <ErrorState description={reports.error ?? undefined} onRetry={reports.reload} />
      ) : !reports.data ? (
        <div role="status" aria-label="Đang tải báo lỗi" className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState icon={Flag} title="Không có báo lỗi" description={targetId ? 'Nội dung này không có báo lỗi nào khớp với trạng thái đã chọn.' : 'Không có báo lỗi nào khớp với bộ lọc hiện tại.'} />
      ) : (
        <>
          {reports.status === 'error' && (
            <p role="alert" className="text-sm text-error-text">
              {reports.error}
            </p>
          )}
          <div tabIndex={0} role="region" aria-label="Hàng đợi báo lỗi (cuộn ngang nếu cần)" className="overflow-x-auto rounded-3xl border border-border bg-surface-solid focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40" aria-busy={reports.status === 'loading' || undefined}>
            <table className="w-full text-left text-[15px]">
              <caption className="px-4 pt-4 text-left font-semibold">Hàng đợi báo lỗi, nhóm theo nội dung</caption>
              <thead className="text-sm text-muted">
                <tr>
                  <th scope="col" className="w-12 px-4 py-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Chọn tất cả nội dung trên trang"
                      className="size-5 accent-[var(--color-primary)]"
                    />
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Nội dung
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Lý do
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Số báo lỗi
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Gần nhất
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <ReportGroupRow key={groupKey(group)} group={group} checked={selected.has(groupKey(group))} onToggle={() => toggle(groupKey(group))} />
                ))}
              </tbody>
            </table>
          </div>
          <nav aria-label="Phân trang báo lỗi" className="flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              disabled={page === 0}
              onClick={() => {
                setPage((p) => Math.max(0, p - 1));
                resetView();
              }}
            >
              Trang trước
            </Button>
            <span className="text-sm text-muted">
              Trang {page + 1} / {pageCount}
            </span>
            <Button
              variant="ghost"
              disabled={page + 1 >= pageCount}
              onClick={() => {
                setPage((p) => p + 1);
                resetView();
              }}
            >
              Trang sau
            </Button>
          </nav>
        </>
      )}
    </div>
  );
}

function ReportGroupRow({ group, checked, onToggle }: { group: AdminReportGroup; checked: boolean; onToggle: () => void }) {
  const label = group.target_label ?? `${REPORT_TARGET_LABELS_VI[group.target_kind]} ${group.target_id.slice(0, 8)}`;
  const reasons = Object.entries(group.reasons).sort((a, b) => b[1] - a[1]);
  return (
    <tr className="border-t border-border align-top">
      <td className="px-4 py-3">
        <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Chọn "${label}"`} className="size-5 accent-[var(--color-primary)]" />
      </td>
      <th scope="row" className="px-4 py-3 font-normal">
        <Link to={adminContentPath(group.target_kind, group.target_id)} className="font-semibold text-primary underline-offset-4 hover:underline">
          {label}
        </Link>
        <span className="block text-sm text-muted">{REPORT_TARGET_LABELS_VI[group.target_kind]}</span>
        <details className="mt-1 text-sm">
          <summary className="cursor-pointer text-muted">Xem {group.reports.length} báo lỗi</summary>
          <ul className="mt-1 space-y-1">
            {group.reports.map((r) => (
              <li key={r.id}>
                <span className="font-medium">{reasonLabel(r.reason)}</span> · {REPORT_STATUS_LABELS_VI[r.status]} · {formatDate(r.created_at)}
                {r.content_version != null && ` · bản ${r.content_version}`}
                {r.note && <span className="block text-muted">“{r.note}”</span>}
              </li>
            ))}
          </ul>
        </details>
      </th>
      <td className="px-4 py-3">
        <ul className="space-y-0.5">
          {reasons.map(([reason, count]) => (
            <li key={reason}>
              {reasonLabel(reason)}: <span className="tabular-nums">{count}</span>
            </li>
          ))}
        </ul>
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{group.report_count}</td>
      <td className="whitespace-nowrap px-4 py-3 text-sm">{formatDate(group.latest_at)}</td>
    </tr>
  );
}
