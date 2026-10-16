import { useEffect, useReducer, useRef, useState } from 'react';
import { ArrowLeft, PartyPopper, Sparkles } from 'lucide-react';
import { AiExplainSheet } from '@/components/ai';
import type { AiSheetState } from '@/components/exercise/ai-context';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { sessionErrorMessage } from '@/features/session/error-map';
import { getSessionRecap, type SessionMistake } from '@/features/session/service';
import { getSupabase } from '@/lib/supabase';
import { recapAiState } from './recap-ai';

interface Props {
  sessionId: string;
  /** Learner language and level for the AI tutor; null hides "Giải thích AI". */
  learner: { language: 'en' | 'ko' | 'ja'; level: string } | null;
  saving: boolean;
  /** Marks the recap activity done with the seconds spent on this screen. */
  onDone: (seconds: number) => void;
  onBack: () => void;
}

type Loaded = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; mistakes: SessionMistake[] };

/** The `recap` activity: today's mistakes (at most 10), each with an AI explanation. */
export function RecapView({ sessionId, learner, saving, onDone, onBack }: Props) {
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [attempt, retry] = useReducer((n: number) => n + 1, 0);
  const [ai, setAi] = useState<AiSheetState | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const openedAt = useRef(Date.now());
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const client = getSupabase();
    if (!client) {
      setLoaded({ status: 'error', error: sessionErrorMessage(new Error('supabase_unavailable')) });
      return;
    }
    let active = true;
    setLoaded({ status: 'loading' });
    getSessionRecap(client, sessionId)
      .then((mistakes) => {
        if (active) setLoaded({ status: 'ready', mistakes });
      })
      .catch((error: unknown) => {
        if (active) setLoaded({ status: 'error', error: sessionErrorMessage(error) });
      });
    return () => {
      active = false;
    };
  }, [sessionId, attempt]);

  return (
    <section aria-labelledby="recap-title" className="space-y-5">
      <div className="space-y-1">
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[15px] font-semibold text-primary hover:bg-text/5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Quay lại kế hoạch
        </button>
        <h2 id="recap-title" ref={headingRef} tabIndex={-1} className="scroll-mt-[calc(6rem+env(safe-area-inset-top,0px))] text-[22px] font-extrabold leading-tight tracking-[-0.02em] focus:outline-none">
          Tổng kết: lỗi sai hôm nay
        </h2>
        <p className="text-[15px] text-muted">Xem lại từng lỗi một chút. Hiểu vì sao sai giúp bạn nhớ lâu hơn.</p>
      </div>

      {loaded.status === 'loading' && (
        <div role="status" className="space-y-3">
          <span className="sr-only">Đang tải lỗi sai…</span>
          <Skeleton className="block h-28 w-full rounded-3xl" />
          <Skeleton className="block h-28 w-full rounded-3xl" />
        </div>
      )}
      {loaded.status === 'error' && <ErrorState title="Không tải được phần tổng kết" description={loaded.error} onRetry={retry} headingLevel="h3" />}
      {loaded.status === 'ready' && loaded.mistakes.length === 0 && (
        <SolidCard className="flex items-start gap-3">
          <PartyPopper aria-hidden className="mt-0.5 size-6 shrink-0 text-success" />
          <p className="text-[15px]">Hôm nay bạn chưa có lỗi sai nào cần xem lại. Làm tốt lắm!</p>
        </SolidCard>
      )}
      {loaded.status === 'ready' && loaded.mistakes.length > 0 && (
        <ol className="space-y-3" aria-label="Lỗi sai hôm nay">
          {loaded.mistakes.map((mistake, index) => {
            const state = learner ? recapAiState(mistake, learner) : null;
            return (
              <li key={mistake.attempt_id}>
                <SolidCard className="relative space-y-2 overflow-hidden pl-6 before:absolute before:inset-y-5 before:left-0 before:w-1 before:rounded-r-full before:bg-error">
                  <h3 className="text-[17px] font-bold leading-snug break-words">{mistake.prompt_text || `Lỗi ${index + 1}`}</h3>
                  <dl className="space-y-1 text-[15px]">
                    {mistake.expected_answer !== null && (
                      <div>
                        <dt className="inline text-muted">Đáp án đúng: </dt>
                        <dd className="inline font-semibold break-words">{mistake.expected_answer}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="inline text-muted">Bạn trả lời: </dt>
                      <dd className="inline break-words">{mistake.learner_answer || '(bỏ qua)'}</dd>
                    </div>
                  </dl>
                  {state && (
                    <Button
                      variant="ghost"
                      onClick={(event) => {
                        trigger.current = event.currentTarget;
                        setAi(state);
                        setAiOpen(true);
                      }}
                    >
                      <Sparkles aria-hidden className="size-4" />
                      Giải thích AI
                    </Button>
                  )}
                </SolidCard>
              </li>
            );
          })}
        </ol>
      )}

      <Button
        variant="accent"
        size="lg"
        block
        loading={saving}
        disabled={loaded.status === 'loading'}
        onClick={() => onDone(Math.round((Date.now() - openedAt.current) / 1000))}
      >
        Xong phần tổng kết
      </Button>

      {ai && (
        <AiExplainSheet open={aiOpen} onClose={() => setAiOpen(false)} request={ai.request} fallback={ai.fallback} triggerRef={trigger} />
      )}
    </section>
  );
}
