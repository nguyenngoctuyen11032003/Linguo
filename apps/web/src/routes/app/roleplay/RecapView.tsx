import { useEffect, useRef } from 'react';
import { Check, Circle } from 'lucide-react';
import type { RoleplayScenario } from '@linguo/shared';
import { AI_LABEL, AiFallback, AiLoading, AiResultView, type QuotaGate } from '@/components/ai';
import { Button } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import type { AiQuota } from '@/features/ai-tutor/quota';
import type { AiTutorState } from '@/features/ai-tutor/useAiTutor';
import { collectCorrections, learnerTurns, type RoleplaySession } from '@/features/roleplay/session';

/** What the learner did, kept on screen even when AI is unavailable, followed by the AI recap (existing recap view). */
export function RecapView({
  session,
  scenario,
  summary,
  quota,
  gate,
  onRetry,
  onNew,
}: {
  session: RoleplaySession;
  scenario: RoleplayScenario;
  summary: AiTutorState;
  quota: AiQuota | null;
  gate: QuotaGate;
  onRetry: () => void;
  onNew: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // Finishing from the bottom of a long chat: bring the recap title into view along with focus.
    headingRef.current?.focus();
  }, []);
  const corrections = collectCorrections(session);
  const reached = scenario.goals.filter((g) => session.goals.includes(g.key)).length;
  const lang = session.language;

  return (
    <div className="space-y-4">
      <SolidCard className="space-y-4 p-4">
        <header className="space-y-1">
          <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold leading-snug focus:outline-none">
            Tóm tắt buổi đóng vai
          </h2>
          <p className="text-[15px] text-muted">
            {scenario.title_vi} · bạn đã gửi {learnerTurns(session)} tin nhắn · đạt {reached}/{scenario.goals.length} mục tiêu.
          </p>
        </header>

        <section aria-label="Mục tiêu" className="space-y-1">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Mục tiêu</h3>
          <ul className="space-y-1">
            {scenario.goals.map((g) => {
              const done = session.goals.includes(g.key);
              return (
                <li key={g.key} className="flex items-start gap-2 text-[15px]">
                  {done ? <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" /> : <Circle aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />}
                  <span>
                    {g.label_vi}
                    <span className="sr-only">{done ? ' (đã đạt)' : ' (chưa đạt)'}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {corrections.length > 0 ? (
          <section aria-label="Những chỗ nên sửa" className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Những chỗ nên sửa</h3>
            <ul className="space-y-2">
              {corrections.map((c, i) => (
                <li key={i} className="rounded-2xl border border-border px-3 py-2 text-[15px]">
                  <p className="break-words">
                    <span lang={lang} className="text-muted line-through decoration-1">
                      {c.original}
                    </span>
                    <span aria-hidden> → </span>
                    <span className="sr-only"> nên viết: </span>
                    <span lang={lang} className="font-medium">
                      {c.corrected}
                    </span>
                  </p>
                  <p className="break-words text-sm text-muted">{c.note_vi}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="text-[15px]">Lần này bạn không có lỗi nào cần sửa. Thật tuyệt!</p>
        )}
      </SolidCard>

      <section aria-label="Nhận xét của AI" className="space-y-3">
        {summary.state === 'loading' && <AiLoading label="Đang viết tóm tắt…" />}
        {summary.state === 'ok' && summary.result && (
          <SolidCard className="space-y-3 p-4">
            <p className="text-sm text-muted">{AI_LABEL}</p>
            <AiResultView result={summary.result} language={lang} />
          </SolidCard>
        )}
        {(summary.state === 'quota' || summary.state === 'unavailable' || summary.state === 'error') && (
          <AiFallback state={summary.state} error={summary.error} quota={quota} onRetry={gate.exhausted ? undefined : onRetry} />
        )}
        {summary.state === 'idle' && gate.exhausted && (
          <p className="rounded-2xl border border-border px-4 py-3 text-[15px] text-muted">
            {gate.hint} Phần tóm tắt ở trên vẫn đầy đủ nhé.
          </p>
        )}
      </section>

      <Button variant="accent" onClick={onNew}>
        Luyện tình huống khác
      </Button>
    </div>
  );
}
