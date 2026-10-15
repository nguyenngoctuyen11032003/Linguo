import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { HelpCircle, Sparkles } from 'lucide-react';
import { m as motion } from 'motion/react';
import type { ReportTargetKind, SubmitResult, Verdict } from '@linguo/shared';
import { AiExplainSheet } from '@/components/ai';
import { ReportContentButton } from '@/components/report';
import { Button } from '@/components/ui/Button';
import { reveal } from '@/design/motion';
import { cn } from '@/lib/cn';
import { useMotionPrefs } from '@/providers/MotionProvider';
import { feedbackAiRequests, type AiSheetState, type ExerciseAiInput } from './ai-context';
import { ERROR_TAG_MESSAGES } from './exercise-utils';
import { JAPANESE_SCRIPT_RE } from './machine-speech';

const VERDICT_UI: Record<Verdict, { icon: string; label: string; tone: string; iconTone: string }> = {
  correct: { icon: '✓', label: 'Chính xác', tone: 'border-success/50 bg-success/10', iconTone: 'bg-success text-bg' },
  almost: { icon: '≈', label: 'Gần đúng', tone: 'border-warn/60 bg-warn/10', iconTone: 'bg-warn text-on-warn' },
  incorrect: { icon: '✗', label: 'Chưa đúng', tone: 'border-error/50 bg-error/10', iconTone: 'bg-error text-bg' },
};

export interface FeedbackPanelProps {
  result: SubmitResult | null;
  className?: string;
  /** Lets the learner ask the AI tutor about a revealed or right answer (spec 5 §5). Omit to hide the buttons. */
  ai?: ExerciseAiInput;
  /** Content the "Báo lỗi nội dung" button reports (spec 11 §2). Omit to hide the button. */
  report?: { kind: ReportTargetKind; id: string };
}

/**
 * Verdict feedback. The `role="status"` wrapper stays mounted so screen readers register it before content
 * appears; focus moves to the heading when a new result arrives (not on mount, e.g. when resuming).
 */
export function FeedbackPanel({ result, className, ai, report }: FeedbackPanelProps) {
  const { reduceMotion } = useMotionPrefs();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const attemptId = result?.attempt_id ?? null;
  const seenRef = useRef<string | null>(attemptId);

  useEffect(() => {
    if (attemptId === null || attemptId === seenRef.current) return;
    seenRef.current = attemptId;
    headingRef.current?.focus({ preventScroll: true });
    // Bring the verdict above the sticky action bar (see scroll-mb below) instead of leaving it underneath.
    cardRef.current?.scrollIntoView?.({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [attemptId, reduceMotion]);

  return (
    <div className={className}>
      <div ref={cardRef} role="status" aria-live="polite" className="scroll-mb-[calc(7rem+env(safe-area-inset-bottom,0px))]">
        {result && <FeedbackCard key={result.attempt_id} result={result} reduceMotion={reduceMotion} headingRef={headingRef} />}
      </div>
      {result && ai && <FeedbackAiActions key={result.attempt_id} result={result} ai={ai} />}
      {result && report && (
        <div className="mt-3">
          <ReportContentButton targetKind={report.kind} targetId={report.id} />
        </div>
      )}
    </div>
  );
}

/** "Vì sao?" (analyze_error) and "Giải thích AI" (explain_concept) under a revealed or right answer. */
function FeedbackAiActions({ result, ai }: { result: SubmitResult; ai: ExerciseAiInput }) {
  const [sheet, setSheet] = useState<AiSheetState | null>(null);
  const [open, setOpen] = useState(false);
  const requests = feedbackAiRequests(result, ai);
  if (!requests) return null;
  const { why, explain } = requests;

  const show = (state: AiSheetState) => {
    setSheet(state);
    setOpen(true);
  };

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {why && (
          <Button variant="ghost" onClick={() => show(why)}>
            <HelpCircle aria-hidden className="size-5" />
            Vì sao?
          </Button>
        )}
        <Button variant="ghost" onClick={() => show(explain)}>
          <Sparkles aria-hidden className="size-5" />
          Giải thích AI
        </Button>
      </div>
      {sheet && <AiExplainSheet open={open} onClose={() => setOpen(false)} request={sheet.request} fallback={sheet.fallback} />}
    </>
  );
}

/** Marks the Korean (Hangul), Japanese (kana/kanji) and English ("a/an/the") fragments of a Vietnamese message with their own `lang`. */
function withLanguageSpans(message: string): ReactNode {
  return message.split(/([\uAC00-\uD7AF]+|[\u3040-\u30FF\u31F0-\u31FF\u4E00-\u9FFF\uFF66-\uFF9F]+|\ba\/an\/the\b)/).map((part, i) =>
    i % 2 === 0 ? (
      part
    ) : (
      <span key={i} lang={/[\uAC00-\uD7AF]/.test(part) ? 'ko' : JAPANESE_SCRIPT_RE.test(part) ? 'ja' : 'en'}>
        {part}
      </span>
    ),
  );
}

function FeedbackCard({
  result,
  reduceMotion,
  headingRef,
}: {
  result: SubmitResult;
  reduceMotion: boolean;
  headingRef: RefObject<HTMLHeadingElement>;
}) {
  const ui = VERDICT_UI[result.verdict];
  const tagMessages = result.error_tags.map((tag) => ERROR_TAG_MESSAGES[tag]).filter((m): m is string => Boolean(m));
  const canRetry = result.verdict === 'incorrect' && !result.final;

  return (
    <motion.div
      data-testid="feedback-card"
      variants={reveal('fadeUp', reduceMotion)}
      initial="hidden"
      animate="shown"
      className={cn('min-w-0 rounded-3xl border p-4 break-words', ui.tone)}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-full text-lg font-bold', ui.iconTone)}
        >
          {ui.icon}
        </span>
        <h3 ref={headingRef} tabIndex={-1} className="text-xl font-bold leading-tight focus:outline-none">
          {ui.label}
        </h3>
      </div>
      {tagMessages.length > 0 && (
        <ul className="mt-3 space-y-1 text-[16px] font-medium">
          {tagMessages.map((message) => (
            <li key={message}>{withLanguageSpans(message)}</li>
          ))}
        </ul>
      )}
      {result.feedback_vi && <p className="mt-2 text-[16px]">{result.feedback_vi}</p>}
      {result.display_answer && (
        <p className="mt-3 text-[17px]">
          <span className="block text-sm font-semibold text-text">Đáp án</span>
          <span className="font-semibold">{result.display_answer}</span>
        </p>
      )}
      {result.explanation && <p className="mt-2 text-[16px] text-text">{result.explanation.vi}</p>}
      {canRetry && <p className="mt-3 text-sm text-text">Bạn còn một lần thử. Thử lại hoặc xem đáp án.</p>}
    </motion.div>
  );
}
