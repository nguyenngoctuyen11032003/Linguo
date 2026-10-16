import { Lightbulb } from 'lucide-react';

export interface HintRevealProps {
  levels: string[];
  shown: number;
  onReveal: () => void;
  disabled?: boolean;
}

/** Recognition-stage hints (PRD §6.3): each tap reveals the next level; the count is sent as `hint_count`. */
export function HintReveal({ levels, shown, onReveal, disabled = false }: HintRevealProps) {
  const visible = levels.slice(0, shown);
  return (
    <div className="mt-4 min-w-0">
      {visible.length > 0 && (
        <ol aria-label="Gợi ý" className="mb-2 space-y-1">
          {visible.map((hint, i) => (
            <li
              key={i}
              className="flex gap-2.5 rounded-2xl bg-gold/10 px-4 py-2.5 text-[16px] font-medium break-words ring-1 ring-gold/25 ring-inset"
            >
              <Lightbulb aria-hidden className="mt-1 size-4 shrink-0 text-gold" />
              <span className="min-w-0">{hint}</span>
            </li>
          ))}
        </ol>
      )}
      {shown < levels.length && (
        <button
          type="button"
          onClick={onReveal}
          disabled={disabled}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-border bg-surface-solid px-4 text-[15px] font-bold text-gold not-disabled:hover:bg-gold/10 disabled:cursor-not-allowed disabled:text-muted disabled:outline-2 disabled:-outline-offset-2 disabled:outline-dashed disabled:outline-muted"
        >
          <Lightbulb aria-hidden className="size-4" />
          {shown === 0 ? 'Gợi ý' : 'Gợi ý thêm'} ({shown + 1}/{levels.length})
        </button>
      )}
    </div>
  );
}
