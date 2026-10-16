import { useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { m as motion } from 'motion/react';
import type { ReviewCard } from '@linguo/shared';
import { ReportContentButton } from '@/components/report';
import { EASE_OUT } from '@/design/motion';
import { cn } from '@/lib/cn';
import { useMotionPrefs } from '@/providers/MotionProvider';
import { ContentAudio } from '@/features/audio/ContentAudio';
import { MachineSpeechButton } from '../exercise/MachineSpeechButton';
import { answerText, readCardContent, type CardContent } from './cardContent';

/** Spec 3 §6: the card turns over in 250 ms; reduced motion swaps the faces instantly. */
export const FLIP_DURATION_S = 0.25;

const LANGUAGE_NAMES: Record<CardContent['lang'], string> = { en: 'tiếng Anh', ko: 'tiếng Hàn', ja: 'tiếng Nhật' };

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
        FACE,
        'shadow-[var(--card-sheen),0_6px_0_var(--border),var(--shadow-card)] transition-[translate,box-shadow] duration-150',
        'not-disabled:active:translate-y-[3px] not-disabled:active:shadow-[var(--card-sheen),0_3px_0_var(--border)] disabled:cursor-not-allowed',
      )}
    >
      <FaceGlow />
      <span className="eyebrow">
        {card.direction === 'recognize' ? 'Nghĩa của từ này là gì?' : `Nói bằng ${LANGUAGE_NAMES[content.lang]}`}
      </span>
      <span className="flex flex-1 items-center justify-center py-2">
        {card.direction === 'recognize' ? <TargetWord content={content} /> : <Meaning content={content} big />}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-text/[0.05] px-3 py-1.5 text-[13px] font-semibold text-muted">
        <RefreshCw aria-hidden className="size-3.5" />
        Chạm hoặc nhấn Space để lật
      </span>
    </button>
  );

  const back = (
    <div
      ref={backRef}
      tabIndex={-1}
      data-testid="flashcard-back"
      className={cn(FACE, 'shadow-[var(--card-sheen),0_6px_0_var(--border),var(--shadow-card)] focus:outline-none')}
    >
      <FaceGlow />
      {card.direction === 'recognize' ? (
        <>
          <span lang={content.lang} className="text-[17px] font-semibold text-muted">
            {content.text}
          </span>
          <Meaning content={content} big />
        </>
      ) : (
        <>
          <span lang="vi" className="text-[17px] font-semibold text-muted">
            {content.meaningVi}
          </span>
          <TargetWord content={content} />
        </>
      )}
      {content.example && (
        <p className="mt-2 w-full rounded-2xl border-l-4 border-accent bg-text/[0.04] px-4 py-3 text-left">
          <span lang={content.lang} className="block text-[17px] font-semibold">
            {content.example.target}
          </span>
          {content.example.translationVi && (
            <span lang="vi" className="block text-[15px] text-text">
              {content.example.translationVi}
            </span>
          )}
        </p>
      )}
      {content.note && (
        <p className="w-full text-left text-[15px] text-text">
          <span className="font-semibold">Ghi chú: </span>
          {content.note}
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
      {showAudio && card.item.audio_path && (
        <div className="mt-3 flex justify-center">
          <ContentAudio key={card.card_id} assetId={card.item.audio_path} fallbackText={content.text} fallbackLang={content.lang} compact />
        </div>
      )}
      {showAudio && !card.item.audio_path && content.text && (
        <div className="mt-3 flex flex-col items-center gap-1">
          {/* One row: two stacked buttons both reading "Nghe" looked like a duplicate, so with an example each says what it plays. */}
          <div className="flex flex-wrap justify-center gap-2">
            {/* Keyed by face so flipping cancels the speech in progress. */}
            <MachineSpeechButton
              key={`${card.card_id}:w:${flipped}`}
              text={content.text}
              lang={content.lang}
              label="Nghe phát âm"
              compact={!(flipped && content.example)}
              note={false}
            />
            {flipped && content.example && (
              <MachineSpeechButton key={`${card.card_id}:e`} text={content.example.target} lang={content.lang} label="Nghe câu ví dụ" note={false} />
            )}
          </div>
          {/* Hidden when the browser has no voice and both buttons render nothing. */}
          <p className="text-sm text-muted [div:empty+&]:hidden">Giọng đọc tự động — chỉ để luyện nghe</p>
        </div>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {flipped ? `Đáp án: ${answerText(card)}` : ''}
      </p>
    </div>
  );
}

const FACE =
  'card relative isolate flex min-h-72 w-full min-w-0 flex-col items-center justify-center gap-3 overflow-hidden px-5 py-6 text-center break-words sm:min-h-80 sm:py-8';

/** Soft brand glow in the card's top corner, purely decorative. */
function FaceGlow() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -right-16 -top-20 -z-10 size-56 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--primary)_22%,transparent),transparent_70%)]"
    />
  );
}

/** Long prompts (phrases, grammar patterns) step down in size so a card face never turns into a wall of display type. */
const TARGET_SIZES: Array<[number, string]> = [
  [12, 'text-[clamp(36px,12vw,56px)]'],
  [24, 'text-[clamp(28px,8.5vw,40px)]'],
  [Infinity, 'text-[clamp(22px,6.5vw,30px)]'],
];
const MEANING_SIZES: Array<[number, string]> = [
  [16, 'text-[clamp(28px,9vw,40px)]'],
  [40, 'text-[clamp(22px,6.5vw,30px)]'],
  [Infinity, 'text-[clamp(19px,5.5vw,24px)]'],
];

function sizeFor(text: string | null | undefined, sizes: Array<[number, string]>): string {
  const length = (text ?? '').length;
  return sizes.find(([max]) => length <= max)![1];
}

function TargetWord({ content }: { content: CardContent }) {
  return (
    <span className="flex flex-col items-center gap-1.5">
      <span lang={content.lang} className={cn('font-extrabold leading-[1.12] tracking-[-0.02em]', sizeFor(content.text, TARGET_SIZES))}>
        {content.text}
      </span>
      {content.reading && (
        <span lang={content.lang} className="text-[17px] text-text">
          {content.reading}
        </span>
      )}
      {content.romanization && <span className="text-[17px] text-text">{content.romanization}</span>}
      {content.ipa && <span className="font-mono text-[16px] text-text">/{content.ipa.replace(/^\/|\/$/g, '')}/</span>}
      {content.pos && <span className="text-sm font-medium text-muted">{content.pos}</span>}
    </span>
  );
}

function Meaning({ content, big = false }: { content: CardContent; big?: boolean }) {
  return (
    <span
      lang="vi"
      className={cn('font-extrabold leading-tight tracking-[-0.015em]', big ? sizeFor(content.meaningVi, MEANING_SIZES) : 'text-[clamp(22px,7vw,28px)]')}
    >
      {content.meaningVi}
    </span>
  );
}
