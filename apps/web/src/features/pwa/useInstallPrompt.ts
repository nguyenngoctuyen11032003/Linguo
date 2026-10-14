import { useCallback, useEffect, useSyncExternalStore } from 'react';

/** Chromium's install event (not in lib.dom). */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
}

/**
 * - `available`: the browser offered an install prompt (button "Cài Linguo lên máy").
 * - `ios`: iPhone/iPad, install via Share → Add to Home Screen (instructions only).
 * - `installed`: running standalone or just installed: nothing to show.
 * - `unsupported`: no prompt (yet); the section stays hidden.
 */
export type InstallStatus = 'available' | 'ios' | 'installed' | 'unsupported';

type Listener = () => void;
let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let capturing = false;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

function onBeforeInstallPrompt(event: Event): void {
  // No automatic mini-infobar: the prompt is shown only from the Settings button.
  event.preventDefault();
  deferred = event as BeforeInstallPromptEvent;
  emit();
}

function onAppInstalled(): void {
  installed = true;
  deferred = null;
  emit();
}

/**
 * Idempotent. `beforeinstallprompt` can fire before Settings is ever opened, so the integrator should call
 * this at startup; useInstallPrompt() also calls it.
 */
export function captureInstallPrompt(): void {
  if (capturing || typeof window === 'undefined') return;
  capturing = true;
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  window.addEventListener('appinstalled', onAppInstalled);
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || Boolean(window.matchMedia?.('(display-mode: standalone)').matches);
}

/** iPhone, iPod and iPad (iPadOS reports itself as a Mac with touch). */
export function isIos(nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> = navigator): boolean {
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
}

function currentStatus(): InstallStatus {
  if (installed || isStandalone()) return 'installed';
  if (deferred) return 'available';
  if (typeof navigator !== 'undefined' && isIos()) return 'ios';
  return 'unsupported';
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface InstallPrompt {
  status: InstallStatus;
  /** Shows the browser prompt (status 'available' only); resolves with the learner's choice. */
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

export function useInstallPrompt(): InstallPrompt {
  useEffect(() => captureInstallPrompt(), []);
  const status = useSyncExternalStore(subscribe, currentStatus, () => 'unsupported' as const);

  const promptInstall = useCallback(async () => {
    const event = deferred;
    if (!event) return 'unavailable' as const;
    // A prompt event can be used once.
    deferred = null;
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === 'accepted') installed = true;
      return outcome;
    } catch {
      return 'dismissed' as const;
    } finally {
      emit();
    }
  }, []);

  return { status, promptInstall };
}

/** Test hook. */
export function resetInstallPromptForTests(): void {
  if (typeof window !== 'undefined') {
    window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.removeEventListener('appinstalled', onAppInstalled);
  }
  deferred = null;
  installed = false;
  capturing = false;
  emit();
}
