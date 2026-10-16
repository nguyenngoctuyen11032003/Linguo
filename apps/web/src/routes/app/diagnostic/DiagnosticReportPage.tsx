import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleCheck, CircleDashed, Info, X } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import {
  CONTENT_MAX_LEVEL,
  isAtContentCeiling,
  REPORT_SKILLS,
  type DiagnosticConfidence,
  type DiagnosticReport,
  type PlacementResult,
} from '@linguo/shared';
import { Button, buttonClasses } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { useDiagnosticRun } from '@/features/diagnostic/useDiagnosticRun';
import { contentCeilingMessage } from '@/features/learning-paths/content-ceiling';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { cn } from '@/lib/cn';
import { GENERIC_ERROR_MESSAGE } from '@/lib/error-fallback';
import { playSound } from '@/lib/sound';
import { clampReportToContent, CONFIDENCE_LABELS, formatDate, levelLabel, missingReason, rangeLabel, SKILL_LABELS } from './labels';

const HOME = '/app';
const SETTINGS_PATHS = '/app/cai-dat#lo-trinh';

type SkillRow = DiagnosticReport['skills'][number];

const CONFIDENCE_BARS: Record<DiagnosticConfidence, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

function ConfidenceChip({ confidence }: { confidence: DiagnosticConfidence }) {
  const bars = CONFIDENCE_BARS[confidence];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-text/5 px-2.5 py-1 text-sm font-semibold">
      <span aria-hidden="true" className="flex items-end gap-0.5">
        {[1, 2, 3].map((n) => (
          <span key={n} className={cn('w-1 rounded-full', n <= bars ? 'bg-primary' : 'bg-text/20')} style={{ height: 4 + n * 3 }} />
        ))}
      </span>
      Độ tin cậy: {CONFIDENCE_LABELS[confidence]}
    </span>
  );
}

function SkillCard({ row }: { row: SkillRow }) {
  const estimated = row.status === 'estimated' && row.level_code !== null;
  const range = rangeLabel(row.range);
  return (
    <li>
      <SolidCard className="h-full p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="eyebrow text-text">{SKILL_LABELS[row.skill]}</h3>
          {estimated ? (
            <span className="inline-flex items-center gap-1 text-sm text-muted">
              <CircleCheck aria-hidden className="size-4" />
              Đã ước lượng
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-sm text-muted">
              <CircleDashed aria-hidden className="size-4" />
              Chưa đủ dữ liệu
            </span>
          )}
        </div>
        {estimated ? (
          <div className="mt-3 space-y-3">
            <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              {/* A level code ("B1") is the big numeral; a worded level ("Mới bắt đầu") steps down so it stays on one line. */}
              <span className={cn('stat-num pr-1 text-gradient-fade', levelLabel(row.level_code).length <= 4 ? 'text-[48px]' : 'text-[34px]')}>
                {levelLabel(row.level_code)}
              </span>
              {range && <span className="text-[14px] font-semibold text-muted">khoảng {range}</span>}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {row.confidence && <ConfidenceChip confidence={row.confidence} />}
              <span className="text-sm text-muted">dựa trên {row.sample_size} câu</span>
            </div>
          </div>
        ) : (
          <p className="mt-1 text-[15px] text-muted">{missingReason(row)}</p>
        )}
      </SolidCard>
    </li>
  );
}

interface PlacementProps {
  report: DiagnosticReport;
  targetLevel: string | undefined;
  /** The hook reloads the learning paths itself after an applied placement. */
  accept: () => Promise<PlacementResult | null>;
  acceptError: string | null;
  /** The hook has loaded the report itself (a report passed in navigation state shows first). */
  ready: boolean;
  /** Loading the report failed while a report from navigation state is on screen: accept cannot run until a retry. */
  loadError: string | null;
  onRetryLoad: () => void;
}

function Placement({ report, targetLevel, accept, acceptError, ready, loadError, onRetryLoad }: PlacementProps) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PlacementResult | null>(null);
  const [failed, setFailed] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);
  const current = levelLabel(report.current_level);
  const capped = report.capped_level;

  useEffect(() => {
    if (result || failed) messageRef.current?.focus();
  }, [result, failed]);

  const onAccept = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const outcome = await accept();
      if (outcome) setResult(outcome);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const homeButton = (
    <Link to={HOME} className={buttonClasses('accent', 'lg', true)}>
      Về trang chủ
    </Link>
  );

  if (result) {
    let message: ReactNode;
    switch (result.outcome) {
      case 'applied':
        message = (
          <p>Đã cập nhật trình độ lộ trình thành {levelLabel(result.new_level)}. Bài học và ước tính thời gian đã được tính lại.</p>
        );
        break;
      case 'unchanged':
        message = <p>Trình độ lộ trình vẫn là {levelLabel(result.previous_level)} vì kết quả trùng với trình độ hiện tại.</p>;
        break;
      case 'no_suggestion':
        message = <p>Chưa đủ dữ liệu để gợi ý trình độ, nên lộ trình giữ nguyên {levelLabel(result.previous_level)}.</p>;
        break;
      case 'needs_target_update':
        // The target is already the highest level with lessons: there is no higher target to set yet.
        message = targetLevel && isAtContentCeiling(report.language_code, targetLevel) ? (
          <p>
            Trình độ gợi ý {levelLabel(capped)} đã bằng mục tiêu {levelLabel(targetLevel)} của lộ trình, nên lộ trình chưa được đổi.{' '}
            {contentCeilingMessage(report.language_code)}
          </p>
        ) : (
          <p>
            Trình độ gợi ý {levelLabel(capped)} đã bằng hoặc vượt mục tiêu
            {targetLevel ? ` ${levelLabel(targetLevel)}` : ''} của lộ trình, nên lộ trình chưa được đổi. Hãy đặt mục tiêu cao hơn trong{' '}
            <Link to={SETTINGS_PATHS} className="font-semibold text-primary underline underline-offset-4">
              Cài đặt lộ trình
            </Link>{' '}
            rồi làm lại khi sẵn sàng.
          </p>
        );
        break;
    }
    return (
      <div className="space-y-4">
        <div ref={messageRef} tabIndex={-1} role="status" className="rounded-2xl bg-text/5 p-4 text-[15px] focus:outline-none">
          {message}
        </div>
        {homeButton}
      </div>
    );
  }

  if (report.applied_at) {
    return (
      <div className="space-y-4">
        <p className="text-[15px] text-muted">Kết quả này đã được áp dụng cho lộ trình.</p>
        {homeButton}
      </div>
    );
  }

  if (!capped) {
    return (
      <div className="space-y-4">
        <p className="text-[15px]">
          Chưa đủ dữ liệu để gợi ý trình độ lộ trình (cần ít nhất 2 kỹ năng có độ tin cậy trung bình trở lên). Lộ trình giữ ở {current}.
        </p>
        {homeButton}
      </div>
    );
  }

  if (capped === report.current_level) {
    return (
      <div className="space-y-4">
        <p className="text-[15px]">Kết quả phù hợp với trình độ hiện tại của lộ trình ({current}). Không cần thay đổi.</p>
        {homeButton}
      </div>
    );
  }

  const isCapped = report.suggested_level !== null && report.suggested_level !== capped;
  return (
    <div className="space-y-4">
      <p className="text-[15px]">
        Trình độ hiện tại của lộ trình: <strong>{current}</strong>. Kết quả gợi ý: <strong>{levelLabel(capped)}</strong>.
      </p>
      {isCapped && (
        <p className="flex gap-2 rounded-2xl bg-text/5 p-3 text-[15px]">
          <Info aria-hidden className="mt-0.5 size-5 shrink-0" />
          <span>
            Kết quả kiểm tra ở mức {levelLabel(report.suggested_level)}, nhưng mỗi lần Linguo chỉ nâng trình độ lộ trình vài bậc so với hiện
            tại để bài học không tăng độ khó quá đột ngột. Nếu thấy dễ, bạn có thể làm lại bài kiểm tra sau.
          </span>
        </p>
      )}
      {failed && (
        <p ref={messageRef} tabIndex={-1} role="alert" className="text-[15px] text-error focus:outline-none">
          {acceptError ?? 'Không cập nhật được trình độ. Hãy thử lại.'}
        </p>
      )}
      {!ready && loadError !== null && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-text/5 p-3 text-[15px]">
          <span className="min-w-0">Chưa cập nhật được trình độ: {loadError}</span>
          <Button variant="ghost" onClick={onRetryLoad}>
            Thử lại
          </Button>
        </div>
      )}
      <div className="grid gap-2">
        <Button
          variant="accent"
          size="lg"
          block
          loading={busy || (!ready && loadError === null)}
          disabled={!ready}
          onClick={() => void onAccept()}
        >
          Cập nhật trình độ lộ trình thành {levelLabel(capped)}
        </Button>
        <Button variant="ghost" size="lg" block disabled={busy} onClick={() => navigate(HOME)}>
          Giữ trình độ hiện tại
        </Button>
      </div>
    </div>
  );
}

/** Honest per-skill report at /app/kiem-tra/:pathId/ket-qua; the path level changes only on explicit accept. */
export function DiagnosticReportPage() {
  const { pathId = '' } = useParams();
  const location = useLocation();
  const run = useDiagnosticRun(pathId, { preferReport: true });
  const { paths } = useLearningPaths();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stateReport = (location.state as { report?: DiagnosticReport | null } | null)?.report ?? null;
  const rawReport = run.report ?? stateReport;
  const { report, clamped } = rawReport ? clampReportToContent(rawReport) : { report: null, clamped: false };
  const path = paths.find((p) => p.id === pathId);

  useEffect(() => {
    if (rawReport) headingRef.current?.focus();
  }, [rawReport]);

  // Fanfare only when the learner arrives straight from finishing the test, not when reopening an older report.
  const finishedHere = (location.state as { finished?: boolean } | null)?.finished === true;
  const celebrated = useRef(false);
  useEffect(() => {
    if (!finishedHere || !rawReport || celebrated.current) return;
    celebrated.current = true;
    playSound('levelUp');
  }, [finishedHere, rawReport]);

  const header = (
    <header className="pt-safe min-[1024px]:border-b min-[1024px]:border-[var(--hairline)]">
      <div className="mx-auto flex min-h-14 w-full max-w-xl min-[1024px]:max-w-[42rem] items-center px-safe py-2">
        <Link to={HOME} aria-label="Đóng kết quả" className="inline-flex size-11 items-center justify-center rounded-full hover:bg-text/5">
          <X aria-hidden className="size-5" />
        </Link>
      </div>
    </header>
  );

  let body: ReactNode;
  if (!report && run.status === 'loading') {
    body = (
      <div role="status" className="space-y-4">
        <span className="sr-only">Đang tải kết quả…</span>
        <Skeleton className="block h-8 w-2/3" />
        <Skeleton className="block h-24 w-full rounded-2xl" />
        <Skeleton className="block h-24 w-full rounded-2xl" />
      </div>
    );
  } else if (!report && run.status === 'error') {
    body = (
      <>
        <h1 className="sr-only">Kết quả kiểm tra</h1>
        <ErrorState title="Không tải được kết quả" description={run.error ?? undefined} onRetry={run.retry} />
      </>
    );
  } else if (!report) {
    body = (
      <div className="space-y-4">
        <h1 className="page-title">Chưa có kết quả</h1>
        <p className="text-muted">Bạn chưa hoàn thành bài kiểm tra trình độ cho lộ trình này.</p>
        <Link to={`/app/kiem-tra/${pathId}`} className={buttonClasses('accent', 'lg', true)}>
          Làm bài kiểm tra
        </Link>
      </div>
    );
  } else {
    const rows = REPORT_SKILLS.map((skill) => report.skills.find((s) => s.skill === skill)).filter((s): s is SkillRow => !!s);
    body = (
      <div className="space-y-6">
        <div>
          <h1 ref={headingRef} tabIndex={-1} className="page-title focus:outline-none">
            Kết quả kiểm tra
          </h1>
          <p className="mt-2 text-[15px] text-muted">
            Ước lượng sơ bộ, không phải chứng chỉ.
            {report.bank_unreviewed && ' Bộ câu hỏi đang thử nghiệm.'}
          </p>
        </div>
        {(report.early_stop || report.rapid_answer_share > 0.3 || clamped) && (
          <ul className="space-y-2 text-[15px]">
            {clamped && (
              <li className="flex gap-2">
                <Info aria-hidden className="mt-0.5 size-5 shrink-0" />
                {contentCeilingMessage(report.language_code)} Kết quả cao hơn được tính là{' '}
                {levelLabel(CONTENT_MAX_LEVEL[report.language_code])}.
              </li>
            )}
            {report.early_stop && (
              <li className="flex gap-2">
                <Info aria-hidden className="mt-0.5 size-5 shrink-0" />
                Bài dừng sớm vì các câu cơ bản còn khó. Bắt đầu từ nền tảng sẽ phù hợp hơn.
              </li>
            )}
            {report.rapid_answer_share > 0.3 && (
              <li className="flex gap-2">
                <Info aria-hidden className="mt-0.5 size-5 shrink-0" />
                Nhiều câu được trả lời rất nhanh nên độ tin cậy đã được hạ một mức.
              </li>
            )}
          </ul>
        )}
        <section aria-labelledby="skills-heading">
          <h2 id="skills-heading" className="eyebrow">
            Theo từng kỹ năng
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {rows.map((row) => (
              <SkillCard key={row.skill} row={row} />
            ))}
          </ul>
        </section>
        <section aria-labelledby="placement-heading">
          <h2 id="placement-heading" className="eyebrow">
            Trình độ lộ trình
          </h2>
          <div className="mt-3">
            <Placement
              report={report}
              targetLevel={path?.targetLevel}
              accept={run.accept}
              acceptError={run.error}
              ready={run.status === 'report'}
              loadError={run.status === 'error' ? (run.error ?? GENERIC_ERROR_MESSAGE) : null}
              onRetryLoad={run.retry}
            />
          </div>
        </section>
        <p className="text-sm text-muted">Bạn có thể làm lại bài kiểm tra từ ngày {formatDate(report.retake_after)}.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      {header}
      <main
        id="main"
        className="mx-auto w-full max-w-xl min-[1024px]:max-w-[42rem] flex-1 px-safe pb-[max(2rem,env(safe-area-inset-bottom,0px))] pt-3 text-[17px] leading-relaxed min-[1024px]:pt-10"
      >
        {body}
      </main>
    </div>
  );
}
