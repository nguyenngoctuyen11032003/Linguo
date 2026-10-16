import { useEffect, useRef } from 'react';
import { ArrowDown, ArrowUp, BookOpen, Check, Dumbbell, ListChecks, RotateCcw, SkipForward, Undo2, type LucideIcon } from 'lucide-react';
import type { ActivityKind, SessionActivity } from '@linguo/shared';
import { cn } from '@/lib/cn';

const KIND_LABELS: Record<ActivityKind, string> = {
  review: 'Ôn tập',
  lesson: 'Bài mới',
  practice: 'Luyện kỹ năng',
  recap: 'Tổng kết',
};

const KIND_ICONS: Record<ActivityKind, LucideIcon> = {
  review: RotateCcw,
  lesson: BookOpen,
  practice: Dumbbell,
  recap: ListChecks,
};

export type MoveDirection = 'up' | 'down';

interface Props {
  activities: SessionActivity[];
  /** Disables skip/restore while a change is being saved (moves are queued by the page). */
  busy: boolean;
  onMove: (index: number, direction: MoveDirection) => void;
  onSkip: (activity: SessionActivity) => void;
  /** Puts a skipped activity back to pending (same serialized queue as the undo offer). */
  onRestore: (activity: SessionActivity) => void;
}

/** Neutral disabled look shared with Button: dashed outline on a flat surface, no opacity. */
const DISABLED_NEUTRAL =
  'disabled:cursor-not-allowed disabled:border-transparent disabled:bg-surface-solid disabled:text-muted disabled:outline-2 disabled:-outline-offset-2 disabled:outline-dashed disabled:outline-muted';

/** 44 px touch target (size-11 = 2.75 rem) for the icon-only up/down buttons. */
export const iconButton = `inline-flex size-11 min-h-11 min-w-11 items-center justify-center rounded-full border border-border bg-surface-solid text-text transition-colors not-disabled:hover:bg-text/5 ${DISABLED_NEUTRAL} focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40`;

const textButton = `inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold transition-colors not-disabled:hover:bg-text/5 ${DISABLED_NEUTRAL} focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40`;

/**
 * The session plan in the learner's order: minutes and reason; pending rows get up/down (keyboard: Tab +
 * Enter/Space) and skip, skipped rows get "Học lại". Rows carry `data-activity-id` and their action button
 * `data-row-action` so the page can put focus back on a row after a skip or restore.
 */
export function ActivityList({ activities, busy, onMove, onSkip, onRestore }: Props) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  /** After a move the row re-renders elsewhere: keep focus on the same arrow (or the other one at an edge). */
  const refocus = useRef<{ id: string; direction: MoveDirection } | null>(null);
  const order = activities.map((a) => a.id).join(',');
  const nextId = activities.find((a) => a.status === 'pending')?.id ?? null;

  useEffect(() => {
    const target = refocus.current;
    if (!target) return;
    refocus.current = null;
    const other: MoveDirection = target.direction === 'up' ? 'down' : 'up';
    const same = buttons.current.get(`${target.id}:${target.direction}`);
    const fallback = buttons.current.get(`${target.id}:${other}`);
    (same && !same.disabled ? same : fallback)?.focus();
  }, [order]);

  const register = (key: string) => (el: HTMLButtonElement | null) => {
    if (el) buttons.current.set(key, el);
    else buttons.current.delete(key);
  };

  return (
    <ol
      className="card space-y-1 p-3"
      aria-label="Các hoạt động của phiên"
    >
      {activities.map((activity, index) => {
        const Icon = KIND_ICONS[activity.kind];
        const pending = activity.status === 'pending';
        const isNext = activity.id === nextId;
        const first = index === 0;
        const last = index === activities.length - 1;
        return (
          <li
            key={activity.id}
            data-activity-id={activity.id}
            tabIndex={-1}
            className={cn(
              'relative rounded-[1.25rem] p-2 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40',
              // Path spine: from this node's centre down into the next row's node.
              'not-last:before:absolute not-last:before:-bottom-10 not-last:before:left-[calc(2.25rem-1px)] not-last:before:top-9 not-last:before:w-0.5 not-last:before:bg-border',
              isNext && 'bg-accent/[0.07] ring-1 ring-accent/25 ring-inset',
            )}
          >
            <div className="flex items-start gap-4">
              <span
                aria-hidden
                className={cn(
                  'relative z-10 grid size-14 shrink-0 place-items-center rounded-full',
                  activity.status === 'done' && 'bg-success text-bg shadow-[0_4px_0_color-mix(in_srgb,var(--success)_55%,black)]',
                  activity.status === 'skipped' && 'border-2 border-dashed border-input-border bg-surface-solid text-muted',
                  pending && isNext && 'press-accent bg-accent text-on-accent ring-[6px] ring-accent/20',
                  pending && !isNext && 'border-2 border-border bg-surface-solid text-primary',
                )}
              >
                {activity.status === 'done' ? (
                  <Check className="size-6" strokeWidth={3} />
                ) : activity.status === 'skipped' ? (
                  <SkipForward className="size-5" />
                ) : (
                  <Icon className="size-6" />
                )}
              </span>
              <div className="min-w-0 flex-1 space-y-1 pt-0.5">
                <p className="text-[13px] font-semibold text-muted">
                  <span className="sr-only">{index + 1}. </span>
                  {KIND_LABELS[activity.kind]} · {activity.minutes} phút
                  {activity.status === 'done' && <span className="font-bold text-success-text"> · Đã xong</span>}
                  {activity.status === 'skipped' && <span className="font-bold text-text"> · Đã bỏ qua</span>}
                </p>
                <h3 className={cn('text-[17px] font-bold leading-snug break-words', !pending && 'text-muted')}>{activity.title_vi}</h3>
                <p className="text-[14px] leading-snug text-muted break-words">
                  <span className="font-semibold text-text">Vì sao: </span>
                  {activity.reason_vi}
                </p>
              </div>
            </div>
            {pending && (
              <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                <button
                  ref={register(`${activity.id}:up`)}
                  type="button"
                  className={iconButton}
                  disabled={first}
                  aria-label={`Đưa “${activity.title_vi}” lên`}
                  onClick={() => {
                    refocus.current = { id: activity.id, direction: 'up' };
                    onMove(index, 'up');
                  }}
                >
                  <ArrowUp aria-hidden className="size-5" />
                </button>
                <button
                  ref={register(`${activity.id}:down`)}
                  type="button"
                  className={iconButton}
                  disabled={last}
                  aria-label={`Đưa “${activity.title_vi}” xuống`}
                  onClick={() => {
                    refocus.current = { id: activity.id, direction: 'down' };
                    onMove(index, 'down');
                  }}
                >
                  <ArrowDown aria-hidden className="size-5" />
                </button>
                <button
                  type="button"
                  data-row-action
                  disabled={busy}
                  onClick={() => onSkip(activity)}
                  aria-label={`Bỏ qua “${activity.title_vi}”`}
                  className={cn(textButton, 'text-muted')}
                >
                  <SkipForward aria-hidden className="size-4" />
                  Bỏ qua
                </button>
              </div>
            )}
            {activity.status === 'skipped' && (
              <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  data-row-action
                  disabled={busy}
                  onClick={() => onRestore(activity)}
                  aria-label={`Học lại “${activity.title_vi}”`}
                  className={cn(textButton, 'border border-border text-text')}
                >
                  <Undo2 aria-hidden className="size-4" />
                  Học lại
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
