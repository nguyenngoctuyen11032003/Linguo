import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Trophy, Waves } from 'lucide-react';
import type { CompleteResult, LessonBlock } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { playSound } from '@/lib/sound';
import { useOnline } from '@/lib/useOnline';

/** Every stage answered at 100% with no near-misses: earns the bigger fanfare. */
function isPerfect(result: CompleteResult): boolean {
  const stages = Object.values(result.accuracy_by_stage).filter((a): a is number => a !== null);
  return stages.length > 0 && stages.every((a) => a >= 1) && result.almost_count === 0;
}

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
  const online = useOnline();
  // The result was worked out on this device (offline lesson): the server has not confirmed it, nor granted XP, yet.
  const unsynced = result !== null && pendingCount > 0;
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
    let done: CompleteResult | null;
    try {
      done = await onComplete();
    } catch {
      done = null;
    }
    const ok = done !== null;
    if (!mounted.current) return;
    if (done) playSound(isPerfect(done) ? 'perfect' : 'complete');
    else playSound('error');
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
        <ul className="card divide-y divide-border px-5 py-1">
          {points.map((point, i) => (
            <li key={i} className="flex gap-3 py-3">
              <CheckCircle2 aria-hidden className="mt-1 size-5 shrink-0 text-success-text" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      )}

      {result ? (
        <section
          aria-labelledby="lesson-stats"
          className="relative isolate overflow-hidden rounded-[2rem] bg-[image:var(--hero-bg)] p-4 text-white min-[360px]:p-5 shadow-[0_24px_60px_-24px_rgb(7_11_18/0.8)] ring-1 ring-white/10 ring-inset"
        >
          <span aria-hidden="true" className="absolute -bottom-24 -right-16 -z-10 size-64 rounded-full bg-radial from-accent/30 to-transparent to-70%" />
          <div className="flex items-center justify-between gap-3">
            <h3 id="lesson-stats" className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">
              Kết quả của bạn
            </h3>
            <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-white/12 text-[#ffc06b]">
              <Trophy className="size-5" />
            </span>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2 min-[360px]:gap-3">
            {STAGE_LABELS.map(([stage, label]) => {
              const accuracy = result.accuracy_by_stage[stage];
              if (accuracy === null) return null;
              const pct = Math.round(accuracy * 100);
              return (
                <div key={stage} className="min-w-0 space-y-2">
                  <dt className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-white/70 min-[360px]:text-xs min-[360px]:tracking-[0.08em]">{label}</dt>
                  <dd className="space-y-2.5">
                    <span className="stat-num block bg-gradient-to-b from-white to-white/60 bg-clip-text pr-1 text-[clamp(30px,10vw,56px)] whitespace-nowrap text-transparent">
                      {pct}%
                    </span>
                    <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-white/15">
                      <span
                        className={pct >= 80 ? 'block h-full rounded-full bg-[#7ee2ae]' : 'block h-full rounded-full bg-gradient-to-r from-accent to-[#ffc06b]'}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
          {(result.confident_wrong > 0 || result.almost_count > 0) && (
            <div className="mt-5 space-y-2 border-t border-white/12 pt-4 text-[14px] leading-snug text-white/85">
              {result.confident_wrong > 0 && (
                <p className="flex items-start gap-2">
                  <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-[#ffc06b]" />
                  <span>{result.confident_wrong} câu bạn tin là đúng nhưng chưa đúng — đáng ôn lại</span>
                </p>
              )}
              {result.almost_count > 0 && (
                <p className="flex items-start gap-2">
                  <Waves aria-hidden className="mt-0.5 size-4 shrink-0 text-white/70" />
                  <span>{result.almost_count} câu gần đúng</span>
                </p>
              )}
            </div>
          )}
          {unsynced && (
            <p role="status" className="mt-4 border-t border-white/12 pt-3 text-[14px] leading-snug text-white/85">
              {online ? 'Đang đồng bộ kết quả lên máy chủ…' : 'Đã lưu — kết quả và điểm sẽ tính khi có mạng.'}
            </p>
          )}
        </section>
      ) : !canComplete ? (
        <div className="space-y-3">
          <p role="status" className="rounded-2xl bg-warn/15 px-4 py-3 text-[15px] font-medium ring-1 ring-warn/40 ring-inset">
            {pendingCount > 0
              ? online
                ? `Còn ${pendingCount} câu đang chờ đồng bộ`
                : `Còn ${pendingCount} câu đã lưu trên máy, sẽ đồng bộ khi có mạng`
              : unresolved.length > 0
                ? `Còn ${unresolved.length} câu chưa có kết quả. Làm xong để hoàn thành bài học.`
                : 'Chưa thể hoàn thành bài học.'}
          </p>
          {unresolved.length > 0 && (
            <ul aria-label="Câu chưa có kết quả" className="card divide-y divide-border overflow-hidden p-0">
              {unresolved.map(({ stepIndex, label }) => (
                <li key={stepIndex} className="flex items-center justify-between gap-3 px-4 py-2.5">
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
