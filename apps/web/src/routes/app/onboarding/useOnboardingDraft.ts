import { useCallback, useEffect, useRef, useState } from 'react';
import { onboardingDraftSchema, type OnboardingDraft, type OnboardingDraftData } from '@linguo/shared';
import { readString, removeKey, writeString } from '@/lib/storage';
import type { StepNumber } from './logic';

export const DRAFT_KEY = 'linguo-onboarding-draft';
const EMPTY: OnboardingDraft = { version: 1, step: 1, data: {} };

/** Pure on purpose: it runs inside a state initializer, which StrictMode invokes twice. */
function load(): { draft: OnboardingDraft; discarded: boolean } {
  const raw = readString(DRAFT_KEY);
  if (!raw) return { draft: EMPTY, discarded: false };
  try {
    const parsed = onboardingDraftSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { draft: parsed.data, discarded: false };
  } catch {
    // fall through: unreadable JSON
  }
  return { draft: EMPTY, discarded: true };
}

/** Wizard state persisted in localStorage so a reload resumes at the same step. */
export function useOnboardingDraft() {
  const [initial] = useState(load);
  const [draft, setDraft] = useState<OnboardingDraft>(initial.draft);
  const persist = useRef(true);
  const cleaned = useRef(false);

  // Declared before the persist effect so the corrupt value is removed first; the ref keeps StrictMode's
  // double-invoked effects from running it twice.
  useEffect(() => {
    if (initial.discarded && !cleaned.current) {
      cleaned.current = true;
      removeKey(DRAFT_KEY);
    }
  }, [initial.discarded]);

  useEffect(() => {
    if (persist.current) writeString(DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  const update = useCallback((patch: Partial<OnboardingDraftData>) => {
    setDraft((d) => ({ ...d, data: { ...d.data, ...patch } }));
  }, []);
  const goTo = useCallback((step: StepNumber) => setDraft((d) => (d.step === step ? d : { ...d, step })), []);
  const reset = useCallback((next: OnboardingDraft) => setDraft(next), []);
  const clear = useCallback(() => {
    persist.current = false;
    removeKey(DRAFT_KEY);
  }, []);

  return { draft, discarded: initial.discarded, update, goTo, reset, clear };
}
