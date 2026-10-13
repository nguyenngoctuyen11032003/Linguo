import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiError, AiErrorCode, AiRequestInput, AiSuccess } from '@linguo/shared';
import { getSupabase } from '@/lib/supabase';
import { notifyAiRun } from './quota';
import { invokeAiTutor, localAiError, type AiTutorResult } from './service';

export type AiTutorStatus = 'idle' | 'loading' | 'ok' | 'quota' | 'unavailable' | 'error';

export interface AiTutorState {
  state: AiTutorStatus;
  result: AiSuccess | null;
  error: AiError | null;
  /**
   * Sends the request. Ignored (resolves null) while another request of this hook is in flight; resolves null
   * too when `reset()` or unmount discarded the answer.
   */
  run: (request: AiRequestInput) => Promise<AiTutorResult | null>;
  /** Back to idle; an answer still in flight is discarded. */
  reset: () => void;
}

export function statusForError(code: AiErrorCode): AiTutorStatus {
  if (code === 'quota_exceeded') return 'quota';
  if (code === 'ai_unavailable') return 'unavailable';
  return 'error';
}

interface View {
  state: AiTutorStatus;
  result: AiSuccess | null;
  error: AiError | null;
}

const IDLE: View = { state: 'idle', result: null, error: null };

export function useAiTutor(): AiTutorState {
  const [view, setView] = useState<View>(IDLE);
  const inFlight = useRef(false);
  /** Bumped by reset/unmount so a late answer is dropped. */
  const generation = useRef(0);

  useEffect(() => {
    const ref = generation;
    return () => {
      ref.current += 1;
      inFlight.current = false;
    };
  }, []);

  const run = useCallback(async (request: AiRequestInput): Promise<AiTutorResult | null> => {
    if (inFlight.current) return null;
    inFlight.current = true;
    const gen = generation.current;
    setView({ state: 'loading', result: null, error: null });
    const client = getSupabase();
    const outcome: AiTutorResult = client ? await invokeAiTutor(client, request) : { ok: false, error: localAiError('ai_unavailable') };
    // Even a discarded answer may have used a turn.
    notifyAiRun(outcome.ok ? outcome.data.quota : outcome.error.quota);
    if (gen !== generation.current) return null;
    inFlight.current = false;
    if (outcome.ok) setView({ state: 'ok', result: outcome.data, error: null });
    else setView({ state: statusForError(outcome.error.error), result: null, error: outcome.error });
    return outcome;
  }, []);

  const reset = useCallback(() => {
    generation.current += 1;
    inFlight.current = false;
    setView(IDLE);
  }, []);

  return { ...view, run, reset };
}
