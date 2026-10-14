import { useEffect, useRef, useState } from 'react';
import { m as motion } from 'motion/react';
import { Volume2, VolumeX } from 'lucide-react';
import type { ReviewCard } from '@linguo/shared';
import { ReportContentButton } from '@/components/report';
import { EASE_OUT } from '@/design/motion';
import { cn } from '@/lib/cn';
import { useMotionPrefs } from '@/providers/MotionProvider';
import { audioUrl } from '../exercise/exercise-utils';
import { answerText, readCardContent, type CardContent } from './cardContent';

/** Spec 3 §6: the card turns over in 250 ms; reduced motion swaps the faces instantly. */
export const FLIP_DURATION_S = 0.25;

const LANGUAGE_NAMES: Record<CardContent['lang'], string> = { en: 'tiếng Anh', ko: 'tiếng Hàn' };

export interface FlashcardProps {
  card: ReviewCard;
  /** Controlled: true once the answer side is shown (CardUiState other than 'front'). */
  flipped: boolean;
  /** Called on tap, or Space/Enter, while the front is showing. Flipping is one-way. */
  onFlip: () => void;
  /** Blocks flipping, e.g. while a grade is being submitted. */
  disabled?: boolean;
  className?: string;
  /** Shows "Báo lỗi nội dung" for the learning item on the back (learner review only, not admin previews). */
  reportable?: boolean;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.closest('button, a[href], input, textarea, select, [role="button"], [role="radio"], [role="checkbox"]') !== null;
}

/**
 * One review card. `recognize` asks for the meaning of the target-language word; `recall` asks for the word
 * from its Vietnamese meaning. The answer is announced through an always-mounted polite live region.
 */
export function Flashcard({ card, flipped, onFlip, disabled = false, className, reportable = false }: FlashcardProps) {
  const { reduceMotion } = useMotionPrefs();
  const content = readCardContent(card);
  const frontRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const frontHadFocus = useRef(false);

  // Space/Enter flips from anywhere on the page, unless another control has focus (it handles its own keys).
  useEffect(() => {
    if (flipped || disabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
      if (isInteractiveTarget(event.target)) return;
      event.preventDefault();
      onFlip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped, disabled, onFlip]);

  // Keep keyboard focus on the card when the focused front face is hidden by the flip.
  useEffect(() => {
    if (flipped && frontHadFocus.current) backRef.current?.focus();
    frontHadFocus.current = false;
  }, [flipped]);

  const flip = () => {
    if (flipped || disabled) return;
    frontHadFocus.current = document.activeElement === frontRef.current;
    onFlip();
  };

  const front = (
    <button
      ref={frontRef}
      type="button"
      onClick={flip}
      disabled={disabled}
      aria-hidden={flipped || undefined}
      tabIndex={flipped ? -1 : undefined}
      data-testid="flashcard-front"
      className={cn(
        'glass flex min-h-72 w-full min-w-0 flex-col items-center justify-center gap-3 rounded-3xl px-5 py-8 text-center break-words',
        'transition-[scale] duration-200 not-disabled:active:scale-[0.99] disabled:cursor-not-allowed',
      )}
    >
      <span className="text-sm font-medium text-muted">
        {card.direction === 'recognize' ? 'Nghĩa của từ này là gì?' : `Nói bằng ${LANGUAGE_NAMES[content.lang]}`}
      </span>
      {card.direction === 'recognize' ? <TargetWord content={content} /> : <Meaning content={content} />}
      <span className="mt-2 text-sm font-medium text-muted">Chạm hoặc nhấn Space để lật</span>
    </button>
  );

  const back = (
    <div
      ref={backRef}
      tabIndex={-1}
      data-testid="flashcard-back"
      className="glass flex min-h-72 w-full min-w-0 flex-col items-center justify-center gap-3 rounded-3xl px-5 py-8 text-center break-words focus:outline-none"
    >
      {card.direction === 'recognize' ? (
        <>
          <span lang={content.lang} className="text-[17px] font-semibold text-muted">
            {content.text}
          </span>
          <Meaning content={content} />
        </>
      ) : (
        <>
          <span className="text-[17px] font-semibold text-muted">{content.meaningVi}</span>
          <TargetWord content={content} />
        </>
      )}
      {content.example && (
        <p className="mt-2 w-full rounded-2xl border border-border bg-surface-solid px-4 py-3 text-left">
          <span lang={content.lang} className="block text-[17px] font-medium">
            {content.example.target}
          </span>
          {content.example.translationVi && <span className="block text-[15px] text-text">{content.example.translationVi}</span>}
        </p>
      )}
      {reportable && <ReportContentButton targetKind="learning_item" targetId={card.item_id} className="mt-1" />}
    </div>
  );

  // Audio would give the answer away on the front of a recall card.
  const showAudio = card.direction === 'recognize' || flipped;

  return (
    <div className={cn('min-w-0', className)} data-direction={card.direction}>
      {reduceMotion ? (
        <div data-testid="flashcard-inner">{flipped ? back : front}</div>
      ) : (
        <div className="[perspective:1200px]">
          <motion.div
            data-testid="flashcard-inner"
            className="grid [transform-style:preserve-3d]"
            initial={false}
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{ duration: FLIP_DURATION_S, ease: EASE_OUT }}
          >
            <div className="[grid-area:1/1] [backface-visibility:hidden]">{front}</div>
            {flipped && <div className="[grid-area:1/1] [backface-visibility:hidden] [transform:rotateY(180deg)]">{back}</div>}
          </motion.div>
        </div>
      )}
      {showAudio && <AudioButton key={card.card_id} path={card.item.audio_path} />}
      <p role="status" aria-live="polite" className="sr-only">
        {flipped ? `Đáp án: ${answerText(card)}` : ''}
      </p>
    </div>
  );
}

function TargetWord({ content }: { content: CardContent }) {
  return (
    <span className="flex flex-col items-center gap-1">
      <span lang={content.lang} className="text-[34px] font-bold leading-tight">
        {content.text}
      </span>
      {content.romanization && <span className="text-[17px] text-text">{content.romanization}</span>}
      {content.ipa && <span className="font-mono text-[16px] text-text">/{content.ipa.replace(/^\/|\/$/g, '')}/</span>}
      {content.pos && <span className="text-sm font-medium text-muted">{content.pos}</span>}
    </span>
  );
}

function Meaning({ content }: { content: CardContent }) {
  return <span className="text-[28px] font-bold leading-tight">{content.meaningVi}</span>;
}

function AudioButton({ path }: { path: string | null }) {
  const [failed, setFailed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasAudio = path !== null && !failed;

  const play = () => {
    if (!path) return;
    try {
      audioRef.current ??= new Audio(audioUrl(path));
      audioRef.current.currentTime = 0;
      void audioRef.current.play().catch(() => setFailed(true));
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="mt-3 flex justify-center">
      <button
        type="button"
        onClick={play}
        disabled={!hasAudio}
        className={cn(
          'inline-flex min-h-12 items-center gap-2 rounded-full px-5 text-[15px] font-semibold',
          hasAudio ? 'bg-primary text-on-primary hover:bg-primary-strong' : 'cursor-not-allowed border border-border text-muted',
        )}
      >
        {hasAudio ? <Volume2 aria-hidden className="size-5" /> : <VolumeX aria-hidden className="size-5" />}
        {hasAudio ? 'Nghe' : 'Chưa có audio'}
      </button>
    </div>
  );
}
