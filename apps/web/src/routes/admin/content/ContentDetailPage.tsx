import { useId, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { ArrowLeft, ExternalLink, Flag } from 'lucide-react';
import type { AdminContentDetail } from '@linguo/shared';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { formatAdminDate, isContentKind, reportTargetKind, reportsPath } from '@/features/admin/content';
import { ADMIN_KIND_LABELS_VI } from '@/features/admin/service';
import { useAdminContentDetail } from '@/features/admin/useAdminContent';
import { useAdminRole } from '@/features/admin/useStaffRole';
import { AnswerPanel } from './AnswerPanel';
import { ContentPreview } from './ContentPreview';
import { RepoHint } from './RepoHint';
import { StatusActions } from './StatusActions';
import { StatusBadge } from './StatusBadge';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="min-w-0">
      <SolidCard className="min-w-0 space-y-3">
        <h2 id={id} className="text-lg font-bold">
          {title}
        </h2>
        {children}
      </SolidCard>
    </section>
  );
}

function titleOf(detail: AdminContentDetail): string {
  const r = detail.row;
  const vi = (v: unknown) => (v && typeof v === 'object' && 'vi' in v && typeof v.vi === 'string' ? v.vi : null);
  const front = r.front && typeof r.front === 'object' && 'text' in r.front && typeof r.front.text === 'string' ? r.front.text : null;
  const prompt = r.prompt && typeof r.prompt === 'object' && 'stem' in r.prompt && typeof r.prompt.stem === 'string' ? r.prompt.stem : null;
  const t = vi(r.title) ?? (typeof r.title_vi === 'string' ? r.title_vi : null) ?? front ?? prompt ?? detail.key ?? detail.id;
  return t.length > 120 ? `${t.slice(0, 119)}…` : t;
}

function openReportsFromState(state: unknown): number | null {
  if (state && typeof state === 'object' && 'openReports' in state && typeof state.openReports === 'number') return state.openReports;
  return null;
}

/** /quan-tri/noi-dung/:kind/:id (spec 11 §4). */
export function ContentDetailPage() {
  const role = useAdminRole();
  const params = useParams();
  const location = useLocation();
  const kind = isContentKind(params.kind) ? params.kind : null;
  const id = params.id && UUID.test(params.id) ? params.id : null;
  const detail = useAdminContentDetail(kind, id);

  const back = (
    <Link to="/quan-tri/noi-dung" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary underline-offset-4 hover:underline">
      <ArrowLeft aria-hidden className="size-4" />
      Danh sách nội dung
    </Link>
  );

  if (!kind || !id) {
    return (
      <div className="space-y-4">
        {back}
        <ErrorState title="Đường dẫn không hợp lệ" description="Loại nội dung hoặc mã nội dung trong đường dẫn không đúng." />
      </div>
    );
  }

  if (detail.status === 'error' && !detail.data) {
    return (
      <div className="space-y-4">
        {back}
        <ErrorState title="Không tải được nội dung" description={detail.error ?? undefined} onRetry={detail.reload} />
      </div>
    );
  }

  const data = detail.data;
  if (!data) {
    return (
      <div className="space-y-4" aria-busy="true">
        {back}
        <p role="status" className="sr-only">
          Đang tải nội dung…
        </p>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const targetKind = reportTargetKind(data.kind);
  const openReports = openReportsFromState(location.state);

  return (
    <div className="min-w-0 space-y-5">
      {back}
      <header className="space-y-2">
        <p className="text-sm font-semibold text-muted">{ADMIN_KIND_LABELS_VI[data.kind]}</p>
        <h1 className="text-[26px] leading-tight font-bold tracking-[-0.03em] break-words">{titleOf(data)}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <StatusBadge status={data.status} isDemo={data.is_demo} />
          {data.key && <span className="font-mono">{data.key}</span>}
          {data.version !== null && <span>Version {data.version}</span>}
          <span>{data.reviewed_at ? `Duyệt lần cuối ${formatAdminDate(data.reviewed_at)}` : 'Chưa có người duyệt'}</span>
        </div>
      </header>

      <Section title="Trạng thái">
        <StatusActions detail={data} role={role} saving={detail.saving} onChange={detail.changeStatus} />
      </Section>

      <Section title="Xem trước">
        <ContentPreview detail={data} />
      </Section>

      <Section title="Đáp án và giải thích">
        <AnswerPanel detail={data} />
      </Section>

      <Section title="Nguồn và giấy phép">
        {data.source ? (
          <dl className="grid gap-x-3 gap-y-1 text-[15px] sm:grid-cols-[8rem_minmax(0,1fr)]">
            <dt className="font-semibold text-muted">Nguồn</dt>
            <dd>
              {data.source.name}
              {data.source.key && <span className="ml-2 font-mono text-xs text-muted">{data.source.key}</span>}
            </dd>
            <dt className="font-semibold text-muted">Giấy phép</dt>
            <dd>{data.source.license ?? 'Chưa ghi'}</dd>
            <dt className="font-semibold text-muted">Ghi công</dt>
            <dd>{data.source.attribution ?? 'Không yêu cầu'}</dd>
            {data.source.url && (
              <>
                <dt className="font-semibold text-muted">Liên kết</dt>
                <dd className="min-w-0 break-all">
                  <a href={data.source.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                    {data.source.url}
                    <ExternalLink aria-hidden className="size-3.5" />
                  </a>
                </dd>
              </>
            )}
          </dl>
        ) : (
          <p className="text-[15px] text-muted">Không có nguồn gắn với nội dung này.</p>
        )}
      </Section>

      <Section title="Lịch sử version">
        {data.revisions.length === 0 ? (
          <p className="text-[15px] text-muted">Chưa có bản ghi version nào.</p>
        ) : (
          <ol className="space-y-1.5">
            {[...data.revisions]
              .sort((a, b) => b.version - a.version)
              .map((r) => (
                <li key={`${r.version}:${r.created_at}`} className="flex flex-wrap items-baseline gap-x-3 text-[15px]">
                  <span className="font-semibold">Version {r.version}</span>
                  <span className="text-muted tabular-nums">{formatAdminDate(r.created_at)}</span>
                  {r.content_hash && <span className="font-mono text-xs text-muted">{r.content_hash.slice(0, 12)}</span>}
                  {r.version === data.version && <span className="text-xs font-semibold text-success-text">hiện tại</span>}
                </li>
              ))}
          </ol>
        )}
      </Section>

      <Section title="Báo lỗi liên quan">
        {targetKind ? (
          <div className="space-y-2 text-[15px]">
            {openReports !== null && (
              <p className="inline-flex items-center gap-1.5">
                <Flag aria-hidden className={openReports > 0 ? 'size-4 text-error-text' : 'size-4 text-muted'} />
                {openReports > 0 ? `${openReports} báo lỗi đang mở.` : 'Không có báo lỗi đang mở.'}
              </p>
            )}
            <p>
              <Link to={reportsPath(targetKind)} className="font-semibold text-primary underline underline-offset-4">
                Mở hàng đợi báo lỗi loại nội dung này
              </Link>
            </p>
          </div>
        ) : (
          <p className="text-[15px] text-muted">Người học không báo lỗi trực tiếp loại nội dung này.</p>
        )}
      </Section>

      <Section title="Gợi ý sửa trong repo">
        <RepoHint detail={data} />
      </Section>
    </div>
  );
}
