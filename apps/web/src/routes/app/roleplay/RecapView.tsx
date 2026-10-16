import { useEffect, useRef } from 'react';
import { Check, Circle, Flag } from 'lucide-react';
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
  onReport,
}: {
  session: RoleplaySession;
  scenario: RoleplayScenario;
  summary: AiTutorState;
  quota: AiQuota | null;
  gate: QuotaGate;
  onRetry: () => void;
  onNew: () => void;
  /** Opens the report dialog for the AI recap (every AI answer carries a report button, PRD 8.2 #9). */
  onReport: (responseId: string, trigger: HTMLButtonElement) => void;
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
      <header className="relative isolate overflow-hidden rounded-[2rem] bg-[image:var(--hero-bg)] p-5 text-white shadow-[0_24px_60px_-24px_rgb(7_11_18/0.8)] ring-1 ring-white/10 ring-inset">
        <div aria-hidden="true" className="absolute -bottom-24 -left-16 -z-10 size-64 rounded-full bg-radial from-accent/30 to-transparent to-70%" />
        <h2 ref={headingRef} tabIndex={-1} className="font-display text-[34px] font-extrabold uppercase leading-[0.95] focus:outline-none">
          Tóm tắt buổi đóng vai
        </h2>
        <p className="mt-2 text-[14px] text-white/75">
          {scenario.title_vi} · bạn đã gửi {learnerTurns(session)} tin nhắn · đạt {reached}/{scenario.goals.length} mục tiêu.
        </p>
        <div aria-hidden="true" className="mt-5 grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">Mục tiêu</p>
            <p className="mt-2 flex items-end gap-1">
              <span className="stat-num bg-gradient-to-b from-white to-white/55 bg-clip-text pr-1 text-[64px] text-transparent">{reached}</span>
              <span className="pb-1.5 text-[15px] font-semibold text-white/70">/{scenario.goals.length}</span>
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">Tin nhắn</p>
            <p className="mt-2 stat-num bg-gradient-to-b from-white to-white/55 bg-clip-text pr-1 text-[64px] text-transparent">{learnerTurns(session)}</p>
          </div>
        </div>
      </header>

      <SolidCard className="space-y-4 p-4">

        <section aria-label="Mục tiêu" className="space-y-1">
          <h3 className="eyebrow">Mục tiêu</h3>
          <ul className="space-y-1">
            {scenario.goals.map((g) => {
              const done = session.goals.includes(g.key);
              return (
                <li key={g.key} className="flex items-start gap-2.5 text-[15px]">
                  {done ? (
                    <span aria-hidden="true" className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-success text-white">
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                  ) : (
                    <Circle aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
                  )}
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
            <h3 className="eyebrow">Những chỗ nên sửa</h3>
            <ul className="space-y-2">
              {corrections.map((c, i) => (
                <li key={i} className="rounded-2xl bg-warn/8 px-3.5 py-2.5 text-[15px] ring-1 ring-warn/30 ring-inset">
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
            <div className="border-t border-border pt-3">
              <Button variant="ghost" onClick={(e) => onReport(summary.result!.response_id, e.currentTarget)}>
                <Flag aria-hidden className="size-4" />
                Báo lỗi
              </Button>
            </div>
          </SolidCard>
        )}
        {(summary.state === 'quota' || summary.state === 'unavailable' || summary.state === 'error') && (
          <AiFallback state={summary.state} error={summary.error} quota={quota} onRetry={gate.exhausted ? undefined : onRetry} />
        )}
        {summary.state === 'idle' && gate.exhausted && (
          <p className="rounded-2xl bg-text/[0.03] px-4 py-3 text-[15px] text-muted ring-1 ring-border ring-inset">
            {gate.hint} Phần tóm tắt ở trên vẫn đầy đủ nhé.
          </p>
        )}
      </section>

      <Button variant="accent" size="lg" block onClick={onNew}>
        Luyện tình huống khác
      </Button>
    </div>
  );
}
