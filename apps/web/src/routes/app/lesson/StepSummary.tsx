import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { CompleteResult, LessonBlock } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

const STAGE_LABELS = [
  ['recognition', 'Nhận biết'],
  ['recall', 'Nhớ lại'],
  ['application', 'Vận dụng'],
] as const;

/** An exercise step without a final result, labelled for the learner ("Câu 3"). */
export interface UnresolvedStep {
  stepIndex: number;
  label: string;
}

interface Props {
  blocks: LessonBlock[];
  result: CompleteResult | null;
  canComplete: boolean;
  pendingCount: number;
  unresolved: UnresolvedStep[];
  onComplete: () => Promise<CompleteResult | null>;
  /** Jumps back to an unresolved exercise. */
  onResume: (stepIndex: number) => void;
}

/** Summary points and run stats; completes the lesson on enter once every attempt is synced. */
export function StepSummary({ blocks, result, canComplete, pendingCount, unresolved, onComplete, onResume }: Props) {
  const points = blocks.flatMap((b) => (b.type === 'summary' ? b.points.map((p) => p.vi) : []));
  const [completing, setCompleting] = useState(false);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const complete = useCallback(async () => {
    setCompleting(true);
    setFailed(false);
    let ok: boolean;
    try {
      ok = (await onComplete()) !== null;
    } catch {
      ok = false;
    }
    if (!mounted.current) return;
    setCompleting(false);
    setFailed(!ok);
  }, [onComplete]);

  useEffect(() => {
    if (result || !canComplete || started.current) return;
    started.current = true;
    void complete();
  }, [result, canComplete, complete]);

  return (
    <div className="space-y-6">
      {points.length > 0 && (
        <ul className="space-y-2">
          {points.map((point, i) => (
            <li key={i} className="flex gap-3">
              <CheckCircle2 aria-hidden className="mt-1 size-4 shrink-0 text-primary" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      )}

      {result ? (
        <section aria-labelledby="lesson-stats" className="space-y-3 rounded-2xl border border-border bg-surface-solid p-4">
          <h2 id="lesson-stats" className="text-base font-bold">
            Kết quả của bạn
          </h2>
          <dl className="grid grid-cols-3 gap-3">
            {STAGE_LABELS.map(([stage, label]) => {
              const accuracy = result.accuracy_by_stage[stage];
              if (accuracy === null) return null;
              return (
                <div key={stage}>
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd className="text-xl font-bold">{Math.round(accuracy * 100)}%</dd>
                </div>
              );
            })}
          </dl>
          {result.confident_wrong > 0 && <p className="text-[15px]">Bạn chắc chắn nhưng sai {result.confident_wrong} câu</p>}
          {result.almost_count > 0 && <p className="text-[15px]">{result.almost_count} câu gần đúng</p>}
        </section>
      ) : !canComplete ? (
        <div className="space-y-3">
          <p role="status" className="rounded-2xl bg-warn/15 px-4 py-3 text-[15px]">
            {pendingCount > 0
              ? `Còn ${pendingCount} câu đang chờ đồng bộ`
              : unresolved.length > 0
                ? `Còn ${unresolved.length} câu chưa có kết quả. Làm xong để hoàn thành bài học.`
                : 'Chưa thể hoàn thành bài học.'}
          </p>
          {unresolved.length > 0 && (
            <ul aria-label="Câu chưa có kết quả" className="divide-y divide-border rounded-2xl border border-border bg-surface-solid">
              {unresolved.map(({ stepIndex, label }) => (
                <li key={stepIndex} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="font-medium">{label}</span>
                  <Button variant="ghost" aria-label={`Làm tiếp ${label}`} onClick={() => onResume(stepIndex)}>
                    Làm tiếp
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : failed ? (
        <div role="alert" className="space-y-3">
          <p className="text-[15px]">Chưa lưu được kết quả bài học.</p>
          <Button variant="ghost" onClick={() => void complete()}>
            Thử hoàn thành lại
          </Button>
        </div>
      ) : (
        <p role="status" className="flex items-center gap-3 text-muted">
          <Spinner className="size-5 text-primary" />
          {completing ? 'Đang lưu kết quả…' : 'Đang chuẩn bị kết quả…'}
        </p>
      )}
    </div>
  );
}
