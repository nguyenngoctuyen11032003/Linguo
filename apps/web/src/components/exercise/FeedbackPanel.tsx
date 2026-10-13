import { useEffect, useRef, type RefObject } from 'react';
import { motion } from 'motion/react';
import type { SubmitResult, Verdict } from '@linguo/shared';
import { reveal } from '@/design/motion';
import { cn } from '@/lib/cn';
import { useMotionPrefs } from '@/providers/MotionProvider';
import { ERROR_TAG_MESSAGES } from './exercise-utils';

const VERDICT_UI: Record<Verdict, { icon: string; label: string; tone: string; iconTone: string }> = {
  correct: { icon: '✓', label: 'Chính xác', tone: 'border-success/50 bg-success/10', iconTone: 'bg-success text-bg' },
  almost: { icon: '≈', label: 'Gần đúng', tone: 'border-warn/60 bg-warn/10', iconTone: 'bg-warn text-on-warn' },
  incorrect: { icon: '✗', label: 'Chưa đúng', tone: 'border-error/50 bg-error/10', iconTone: 'bg-error text-bg' },
};

export interface FeedbackPanelProps {
  result: SubmitResult | null;
  className?: string;
}

/**
 * Verdict feedback. The `role="status"` wrapper stays mounted so screen readers register it before content
 * appears; focus moves to the heading when a new result arrives (not on mount, e.g. when resuming).
 */
export function FeedbackPanel({ result, className }: FeedbackPanelProps) {
  const { reduceMotion } = useMotionPrefs();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const attemptId = result?.attempt_id ?? null;
  const seenRef = useRef<string | null>(attemptId);

  useEffect(() => {
    if (attemptId === null || attemptId === seenRef.current) return;
    seenRef.current = attemptId;
    headingRef.current?.focus();
  }, [attemptId]);

  return (
    <div role="status" aria-live="polite" className={className}>
      {result && <FeedbackCard key={result.attempt_id} result={result} reduceMotion={reduceMotion} headingRef={headingRef} />}
    </div>
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
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      {result.feedback_vi && <p className="mt-2 text-[16px]">{result.feedback_vi}</p>}
      {result.display_answer && (
        <p className="mt-3 text-[17px]">
          <span className="block text-sm font-semibold text-muted">Đáp án</span>
          <span className="font-semibold">{result.display_answer}</span>
        </p>
      )}
      {result.explanation && <p className="mt-2 text-[16px] text-muted">{result.explanation.vi}</p>}
      {canRetry && <p className="mt-3 text-sm text-muted">Bạn còn một lần thử. Thử lại hoặc xem đáp án.</p>}
    </motion.div>
  );
}
