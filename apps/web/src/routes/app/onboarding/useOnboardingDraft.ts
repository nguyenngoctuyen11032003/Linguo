import { useCallback, useEffect, useRef, useState } from 'react';
import { onboardingDraftSchema, type LanguageCode, type OnboardingDraft, type OnboardingDraftData } from '@linguo/shared';
import { readString, removeKey, writeString } from '@/lib/storage';
import type { StepNumber } from './logic';

export const DRAFT_KEY = 'linguo-onboarding-draft';
const EMPTY: OnboardingDraft = { version: 1, step: 1, data: {} };

function load(): { draft: OnboardingDraft; discarded: boolean } {
  const raw = readString(DRAFT_KEY);
  if (!raw) return { draft: EMPTY, discarded: false };
  try {
    const parsed = onboardingDraftSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { draft: parsed.data, discarded: false };
  } catch {
    // fall through: unreadable JSON
  }
  removeKey(DRAFT_KEY);
  return { draft: EMPTY, discarded: true };
}

/** Wizard state persisted in localStorage so a reload resumes at the same step. */
export function useOnboardingDraft(initialLanguage?: LanguageCode) {
  const [initial] = useState(load);
  const [draft, setDraft] = useState<OnboardingDraft>(() =>
    initialLanguage && !initial.draft.data.language
      ? { ...initial.draft, data: { ...initial.draft.data, language: initialLanguage } }
      : initial.draft,
  );
  const persist = useRef(true);

  useEffect(() => {
    if (persist.current) writeString(DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  const update = useCallback((patch: Partial<OnboardingDraftData>) => {
    setDraft((d) => ({ ...d, data: { ...d.data, ...patch } }));
  }, []);
  const goTo = useCallback((step: StepNumber) => setDraft((d) => ({ ...d, step })), []);
  const clear = useCallback(() => {
    persist.current = false;
    removeKey(DRAFT_KEY);
  }, []);

  return { draft, discarded: initial.discarded, update, goTo, clear };
}
