import { useEffect, useRef, useState, type RefObject } from 'react';
import { Flag, RefreshCw, X } from 'lucide-react';
import type { AiRequestInput } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAiNotice } from '@/features/ai-tutor/useAiNotice';
import { track } from '@/features/analytics';
import { useAiQuota } from '@/features/ai-tutor/useAiQuota';
import { useAiTutor } from '@/features/ai-tutor/useAiTutor';
import { AiFallback, type AiFallbackText } from './AiFallback';
import { AiModal } from './AiModal';
import { AiNoticeDialog } from './AiNoticeDialog';
import { AiQuotaChip } from './AiQuotaChip';
import { AiReportDialog } from './AiReportDialog';
import { AiResultView } from './AiResultView';

export const AI_LABEL = 'Giải thích AI · có thể chưa chính xác';
export const AI_WRITING_LABEL = 'Nhận xét AI · có thể chưa chính xác';

const TITLES: Record<AiRequestInput['task'], string> = {
  explain_concept: 'Giải thích AI',
  analyze_error: 'Vì sao?',
  generate_practice: 'Bài luyện thêm',
  review_writing: 'Nhận xét bài viết',
};

const LOADING: Partial<Record<AiRequestInput['task'], string>> = {
  generate_practice: 'Đang soạn bài luyện…',
  review_writing: 'Đang đọc bài viết…',
};

export interface AiExplainSheetProps {
  open: boolean;
  onClose: () => void;
  request: AiRequestInput;
  /** Curated (non-AI) explanation shown when AI is unavailable or out of quota. */
  fallback?: AiFallbackText;
  triggerRef?: RefObject<HTMLElement | null>;
}

export function AiLoading({ label = 'Đang soạn giải thích…' }: { label?: string }) {
  return (
    <div role="status" className="space-y-3">
      <p className="text-[15px] text-muted">{label}</p>
      <Skeleton className="block h-5 w-3/4" />
      <Skeleton className="block h-4 w-full" />
      <Skeleton className="block h-4 w-11/12" />
      <Skeleton className="block h-4 w-2/3" />
      <Skeleton className="block h-16 w-full rounded-2xl" />
    </div>
  );
}

/**
 * AI explanation of a concept / error / practice set: bottom sheet on phones, side panel ≥ md.
 * The privacy notice comes first until it has been acknowledged.
 */
export function AiExplainSheet({ open, onClose, request, fallback, triggerRef }: AiExplainSheetProps) {
  const notice = useAiNotice();
  const quota = useAiQuota();
  const ai = useAiTutor();
  const aiRef = useRef(ai);
  aiRef.current = ai;

  const [current, setCurrent] = useState<AiRequestInput>(request);
  const [reportOpen, setReportOpen] = useState(false);
  const reportButtonRef = useRef<HTMLButtonElement>(null);

  const needsNotice = !notice.acknowledged && notice.status !== 'loading';
  const ready = notice.acknowledged;
  const requestKey = JSON.stringify(request);

  // Ask once per opening (and again when the caller changes the request while open).
  useEffect(() => {
    if (!open || !ready) return;
    const next = JSON.parse(requestKey) as AiRequestInput;
    setCurrent(next);
    void aiRef.current.run(next);
  }, [open, ready, requestKey]);

  const task = request.task;
  useEffect(() => {
    if (open) track('ai_sheet_opened', { task });
  }, [open, task]);

  useEffect(() => {
    if (open) return;
    setReportOpen(false);
    aiRef.current.reset();
  }, [open]);

  const run = (req: AiRequestInput) => {
    setCurrent(req);
    void ai.run(req);
  };

  const liveQuota = ai.result?.quota ?? ai.error?.quota ?? quota.quota;

  let body;
  if (!ready || ai.state === 'idle' || ai.state === 'loading') {
    body = <AiLoading label={LOADING[request.task]} />;
  } else if (ai.state === 'ok' && ai.result) {
    body = (
      <div className="space-y-5">
        <AiResultView result={ai.result} language={request.language} request={current} />
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {current.task === 'explain_concept' && (
            <Button variant="ghost" onClick={() => run({ ...current, variant: 'different' })}>
              <RefreshCw aria-hidden className="size-4" />
              Giải thích cách khác
            </Button>
          )}
          <Button ref={reportButtonRef} variant="ghost" onClick={() => setReportOpen(true)}>
            <Flag aria-hidden className="size-4" />
            Báo lỗi
          </Button>
        </div>
      </div>
    );
  } else {
    const state = ai.state === 'quota' || ai.state === 'unavailable' ? ai.state : 'error';
    body = <AiFallback state={state} error={ai.error} quota={liveQuota} fallback={fallback} onRetry={() => run(current)} />;
  }

  return (
    <>
      <AiNoticeDialog open={open && needsNotice} onAccept={notice.ack} onClose={onClose} triggerRef={triggerRef} />
      <AiModal
        open={open && !needsNotice}
        onClose={onClose}
        layout="panel"
        active={!reportOpen}
        triggerRef={triggerRef}
        title={TITLES[request.task]}
        description={<span className="text-sm font-medium">{request.task === 'review_writing' ? AI_WRITING_LABEL : AI_LABEL}</span>}
        headerExtra={
          <span className="flex shrink-0 items-center gap-2">
            <AiQuotaChip quota={liveQuota} />
            <button
              type="button"
              aria-label="Đóng"
              onClick={onClose}
              className="inline-flex size-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-text/5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
            >
              <X aria-hidden className="size-5" />
            </button>
          </span>
        }
      >
        <div aria-live="polite" aria-busy={ai.state === 'loading' || undefined}>
          {body}
        </div>
      </AiModal>
      <AiReportDialog
        open={open && reportOpen}
        onClose={() => setReportOpen(false)}
        usageId={ai.result?.response_id ?? null}
        stacked
        triggerRef={reportButtonRef}
      />
    </>
  );
}
