import { useEffect, useState } from 'react';
import { LANGUAGE_CODES, type LanguageCode } from '@linguo/shared';
import { getSupabase } from '@/lib/supabase';

export interface AssignedFormLanguage {
  /** 'idle' without a form id; 'error' when the lookup failed or the form is not readable (unpublished, unknown). */
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** The language of the published form, once known. */
  language: LanguageCode | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Language of the exam form a class assignment points at (`?de=` on the exam hub), so the hub can open the form on the
 * learner's path of that language instead of the current one. Published forms are readable by every signed-in user.
 */
export function useAssignedFormLanguage(formId: string | null): AssignedFormLanguage {
  const client = getSupabase();
  const [state, setState] = useState<{ formId: string; status: 'ready' | 'error'; language: LanguageCode | null } | null>(null);

  useEffect(() => {
    if (!formId || !UUID.test(formId)) return;
    let active = true;
    const done = (status: 'ready' | 'error', language: LanguageCode | null) => {
      if (active) setState({ formId, status, language });
    };
    if (!client || typeof client.from !== 'function') {
      done('error', null);
      return;
    }
    Promise.resolve(client.from('exam_forms').select('language_code').eq('id', formId).eq('status', 'published').maybeSingle())
      .then(({ data, error }) => {
        const code = data && typeof data === 'object' && 'language_code' in data ? data.language_code : null;
        if (error || typeof code !== 'string' || !(LANGUAGE_CODES as readonly string[]).includes(code)) done('error', null);
        else done('ready', code as LanguageCode);
      })
      .catch(() => done('error', null));
    return () => {
      active = false;
    };
  }, [client, formId]);

  if (!formId || !UUID.test(formId)) return { status: 'idle', language: null };
  if (!state || state.formId !== formId) return { status: 'loading', language: null };
  return { status: state.status, language: state.language };
}
