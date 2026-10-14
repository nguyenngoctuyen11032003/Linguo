import { useEffect, useId, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Flag, Search } from 'lucide-react';
import { ADMIN_CONTENT_KINDS, CONTENT_STATUSES } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { inputClasses } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  CONTENT_LANGUAGES,
  CONTENT_LANGUAGE_LABELS_VI,
  CONTENT_PAGE_SIZE,
  CONTENT_STATUS_LABELS_VI,
  contentDetailPath,
  filtersFromParams,
  filtersToParams,
  formatAdminDate,
  isContentKind,
  isContentStatus,
  type ContentFilters,
} from '@/features/admin/content';
import { ADMIN_KIND_LABELS_VI } from '@/features/admin/service';
import { useAdminContentList } from '@/features/admin/useAdminContent';
import { cn } from '@/lib/cn';
import { StatusBadge } from './StatusBadge';

/** Debounce of the search box before the URL (and the query) changes. */
export const SEARCH_DEBOUNCE_MS = 350;

const selectClasses = cn(inputClasses(), 'appearance-none min-h-11 pr-10');

/** /quan-tri/noi-dung: filterable, paginated content table (spec 11 §4). Filters live in the URL. */
export function ContentListPage() {
  const [params, setParams] = useSearchParams();
  const filters = filtersFromParams(params);
  const list = useAdminContentList(filters);
  const ids = useId();

  const update = (patch: Partial<ContentFilters>) => {
    // Any filter change goes back to the first page.
    setParams(filtersToParams({ ...filters, page: 1, ...patch }), { replace: patch.page === undefined });
  };

  // Search box: local text, pushed to the URL after a pause.
  const [draft, setDraft] = useState(filters.search);
  const pushed = useRef(filters.search);
  useEffect(() => {
    // Back/forward (or a link) changed the URL: follow it.
    if (filters.search !== pushed.current) {
      pushed.current = filters.search;
      setDraft(filters.search);
    }
  }, [filters.search]);
  useEffect(() => {
    if (draft.trim() === pushed.current.trim()) return;
    const timer = window.setTimeout(() => {
      pushed.current = draft.trim();
      setParams((prev) => filtersToParams({ ...filtersFromParams(prev), search: draft, page: 1 }), { replace: true });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, setParams]);

  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / CONTENT_PAGE_SIZE));
  const items = list.data?.items ?? [];
  const firstShown = total === 0 ? 0 : (filters.page - 1) * CONTENT_PAGE_SIZE + 1;
  const lastShown = Math.min(total, filters.page * CONTENT_PAGE_SIZE);

  return (
    <div className="min-w-0 space-y-5">
      <header>
        <h1 className="text-[26px] font-bold tracking-[-0.03em]">Nội dung</h1>
        <p className="mt-1 text-[15px] text-muted">
          Nội dung được soạn trong repo (<code>content/</code>). Ở đây bạn xem trước, duyệt và đổi trạng thái.
        </p>
      </header>

      <form role="search" aria-label="Lọc nội dung" onSubmit={(e) => e.preventDefault()} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0">
          <label htmlFor={`${ids}-kind`} className="mb-1 block text-sm font-semibold">
            Loại
          </label>
          <select
            id={`${ids}-kind`}
            value={filters.kind}
            onChange={(e) => {
              if (isContentKind(e.target.value)) update({ kind: e.target.value });
            }}
            className={selectClasses}
          >
            {ADMIN_CONTENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {ADMIN_KIND_LABELS_VI[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor={`${ids}-lang`} className="mb-1 block text-sm font-semibold">
            Ngôn ngữ
          </label>
          <select
            id={`${ids}-lang`}
            value={filters.language ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              update({ language: v === 'en' || v === 'ko' ? v : null });
            }}
            className={selectClasses}
          >
            <option value="">Tất cả</option>
            {CONTENT_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {CONTENT_LANGUAGE_LABELS_VI[l]}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor={`${ids}-status`} className="mb-1 block text-sm font-semibold">
            Trạng thái
          </label>
          <select
            id={`${ids}-status`}
            value={filters.status ?? ''}
            onChange={(e) => update({ status: isContentStatus(e.target.value) ? e.target.value : null })}
            className={selectClasses}
          >
            <option value="">Tất cả</option>
            {CONTENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CONTENT_STATUS_LABELS_VI[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor={`${ids}-q`} className="mb-1 block text-sm font-semibold">
            Tìm kiếm
          </label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" />
            <input
              id={`${ids}-q`}
              type="search"
              value={draft}
              maxLength={100}
              placeholder="Key hoặc tiêu đề"
              onChange={(e) => setDraft(e.target.value)}
              className={cn(inputClasses(), 'min-h-11 pl-10')}
            />
          </div>
        </div>
      </form>

      <p role="status" className="text-sm text-muted">
        {list.status === 'ready' || (list.status === 'loading' && list.data)
          ? total === 0
            ? 'Không có nội dung nào khớp bộ lọc.'
            : `Hiển thị ${firstShown}–${lastShown} trên ${total} mục`
          : list.status === 'loading'
            ? 'Đang tải…'
            : ''}
      </p>

      {list.status === 'error' ? (
        <ErrorState title="Không tải được danh sách nội dung" description={list.error ?? undefined} onRetry={list.reload} />
      ) : list.status === 'loading' && !list.data ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className={cn('overflow-x-auto rounded-2xl border border-border bg-surface-solid', list.status === 'loading' && 'opacity-60')}>
          <table className="w-full min-w-[640px] text-left text-[15px]">
            <caption className="sr-only">{`${ADMIN_KIND_LABELS_VI[filters.kind]}, trang ${filters.page}`}</caption>
            <thead className="border-b border-border text-sm text-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Nội dung
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  Ngôn ngữ
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  Trạng thái
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                  Version
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  Cập nhật
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                  Báo lỗi mở
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="max-w-[28rem] px-4 py-2.5">
                    <Link
                      to={contentDetailPath(row.kind, row.id)}
                      state={{ openReports: row.open_reports }}
                      className="font-semibold text-primary underline-offset-2 hover:underline"
                    >
                      {row.label}
                    </Link>
                    {row.key && <div className="truncate font-mono text-xs text-muted">{row.key}</div>}
                  </td>
                  <td className="px-3 py-2.5">{row.language_code ? row.language_code.toUpperCase() : '—'}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={row.status} isDemo={row.is_demo} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{row.version ?? '—'}</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatAdminDate(row.updated_at)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row.open_reports > 0 ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-error-text">
                        <Flag aria-hidden className="size-3.5" />
                        {row.open_reports}
                      </span>
                    ) : (
                      <span className="text-muted">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {total > CONTENT_PAGE_SIZE && (
        <nav aria-label="Phân trang" className="flex items-center justify-between gap-3">
          <Button variant="ghost" disabled={filters.page <= 1} onClick={() => update({ page: filters.page - 1 })}>
            <ChevronLeft aria-hidden className="size-4" />
            Trang trước
          </Button>
          <span className="text-sm text-muted tabular-nums">
            Trang {filters.page} / {pages}
          </span>
          <Button variant="ghost" disabled={filters.page >= pages} onClick={() => update({ page: filters.page + 1 })}>
            Trang sau
            <ChevronRight aria-hidden className="size-4" />
          </Button>
        </nav>
      )}
    </div>
  );
}
