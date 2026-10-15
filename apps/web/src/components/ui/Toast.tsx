import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

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

/**
 * The PWA toasts (UpdateToast, NotificationOpenToast) are fixed in their own slots above the bottom nav. While one
 * shows, the toast stack moves above it instead of covering it: level 1 = the update toast slot, level 2 = the
 * "Bạn có thông báo mới" slot above it. The stack clears the highest active level.
 */
export type ToastLiftLevel = 1 | 2;
type RegisterLift = (level: ToastLiftLevel) => () => void;
const ToastLiftContext = createContext<RegisterLift | null>(null);

const LIFT_CLASS: Record<0 | ToastLiftLevel, string> = {
  0: 'bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-6',
  1: 'bottom-[calc(10.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-[6.5rem]',
  2: 'bottom-[calc(15.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-[11.5rem]',
};

/** Keeps the toast stack clear of a PWA toast while `active`. Does nothing outside <ToastProvider>. */
export function useLiftToasts(level: ToastLiftLevel, active: boolean): void {
  const register = useContext(ToastLiftContext);
  useEffect(() => {
    if (!register || !active) return;
    return register(level);
  }, [register, level, active]);
}
const ICONS = { success: CheckCircle2, error: XCircle, info: Info } as const;
const TONE_CLASS: Record<ToastTone, string> = { success: 'text-success', error: 'text-error', info: 'text-primary' };
/** Errors stay longer so they can be read; everything else is transient. */
const DURATION_MS: Record<ToastTone, number> = { success: 4000, info: 4000, error: 8000 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ToastApi['show']>(
    ({ tone, message }) => {
      const id = nextId.current++;
      setItems((list) => [...list, { id, tone, message }]);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), DURATION_MS[tone]),
      );
    },
    [dismiss],
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
              className="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-2xl border border-border bg-surface-solid py-1 pl-4 pr-1 text-[15px] shadow-[var(--shadow-card)]"
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
