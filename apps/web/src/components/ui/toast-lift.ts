import { createContext, useContext, useEffect } from 'react';

/**
 * The PWA toasts (UpdateToast, NotificationOpenToast) are fixed in their own slots above the bottom nav. While one
 * shows, the app toast stack (ToastProvider) moves above it instead of covering it: level 1 = the update toast slot,
 * level 2 = the "Bạn có thông báo mới" slot above it. The stack clears the highest active level.
 */
export type ToastLiftLevel = 1 | 2;
export type RegisterLift = (level: ToastLiftLevel) => () => void;
export const ToastLiftContext = createContext<RegisterLift | null>(null);

/** Bottom offset of the app toast stack for each lift level (0 = nothing to clear). */
export const LIFT_CLASS: Record<0 | ToastLiftLevel, string> = {
  0: 'bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-6',
  1: 'bottom-[calc(10.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-[6.5rem]',
  2: 'bottom-[calc(15.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-[11.5rem]',
};

/** Keeps the app toast stack clear of a PWA toast while `active`. Does nothing outside <ToastProvider>. */
export function useLiftToasts(level: ToastLiftLevel, active: boolean): void {
  const register = useContext(ToastLiftContext);
  useEffect(() => {
    if (!register || !active) return;
    return register(level);
  }, [register, level, active]);
}
