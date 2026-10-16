import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { LIFT_CLASS, ToastLiftContext, type RegisterLift, type ToastLiftLevel } from './toast-lift';

export type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}
interface ToastApi {
  show: (toast: { tone: ToastTone; message: string }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS = { success: CheckCircle2, error: XCircle, info: Info } as const;
const TONE_CLASS: Record<ToastTone, string> = { success: 'text-success', error: 'text-error', info: 'text-primary' };
/** Errors stay longer so they can be read; everything else is transient. */
const DURATION_MS: Record<ToastTone, number> = { success: 4000, info: 4000, error: 8000 };
type Hold = 'hover' | 'focus';

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());
  /** Why a toast is held open (WCAG 2.2.1): pointer over it or focus inside it. Its timer restarts once released. */
  const holds = useRef(new Map<number, Set<Hold>>());

  const clearTimer = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      clearTimer(id);
      holds.current.delete(id);
      setItems((list) => list.filter((t) => t.id !== id));
    },
    [clearTimer],
  );

  const startTimer = useCallback(
    (id: number, tone: ToastTone) => {
      clearTimer(id);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), DURATION_MS[tone]),
      );
    },
    [clearTimer, dismiss],
  );

  const hold = useCallback(
    (id: number, reason: Hold) => {
      const set = holds.current.get(id) ?? new Set<Hold>();
      set.add(reason);
      holds.current.set(id, set);
      clearTimer(id);
    },
    [clearTimer],
  );

  const release = useCallback(
    (id: number, tone: ToastTone, reason: Hold) => {
      const set = holds.current.get(id);
      if (!set?.delete(reason) || set.size > 0) return;
      holds.current.delete(id);
      startTimer(id, tone);
    },
    [startTimer],
  );

  const show = useCallback<ToastApi['show']>(
    ({ tone, message }) => {
      const id = nextId.current++;
      setItems((list) => [...list, { id, tone, message }]);
      startTimer(id, tone);
    },
    [startTimer],
  );

  useEffect(() => {
    const active = timers.current;
    return () => {
      active.forEach((timer) => window.clearTimeout(timer));
      active.clear();
    };
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  const [lifts, setLifts] = useState<ToastLiftLevel[]>([]);
  const registerLift = useCallback<RegisterLift>((level) => {
    setLifts((list) => [...list, level]);
    return () =>
      setLifts((list) => {
        const index = list.indexOf(level);
        return index < 0 ? list : [...list.slice(0, index), ...list.slice(index + 1)];
      });
  }, []);
  const lift = lifts.reduce<0 | ToastLiftLevel>((max, level) => (level > max ? level : max), 0);

  return (
    <ToastContext.Provider value={api}>
      <ToastLiftContext.Provider value={registerLift}>{children}</ToastLiftContext.Provider>
      <div
        role="status"
        aria-live="polite"
        data-lift={lift}
        className={cn('pointer-events-none fixed inset-x-0 z-[90] flex flex-col items-center gap-2 px-4', LIFT_CLASS[lift])}
      >
        {items.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <div
              key={t.id}
              onPointerEnter={() => hold(t.id, 'hover')}
              onPointerLeave={() => release(t.id, t.tone, 'hover')}
              onFocus={() => hold(t.id, 'focus')}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) release(t.id, t.tone, 'focus');
              }}
              className="glass pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-[1.5rem] py-1 pl-4 pr-1 text-[15px] font-medium shadow-[var(--shadow-dock)]"
            >
              <Icon aria-hidden className={cn('mt-3 size-5 shrink-0', TONE_CLASS[t.tone])} />
              <span className="flex-1 py-2.5">{t.message}</span>
              <button
                type="button"
                aria-label="Đóng thông báo"
                onClick={() => dismiss(t.id)}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-text/5 hover:text-text"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
