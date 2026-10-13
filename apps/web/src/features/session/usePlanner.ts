import { useCallback, useRef, useState } from 'react';
import { planSession, shortenPlan, type SessionInputs, type SessionPlan, type StudySession } from '@linguo/shared';
import { getSupabase } from '@/lib/supabase';
import { sessionErrorMessage } from './error-map';
import { getSessionInputs, saveSessionPlan } from './service';

export interface PlannerFns {
  plan: (inputs: SessionInputs, minutes: number) => SessionPlan;
  shorten: (plan: SessionPlan, minutes: number) => SessionPlan;
}

export interface PlannerApi {
  busy: boolean;
  /** Vietnamese message of the last failure; cleared by the next call. */
  error: string | null;
  /** get_session_inputs → planSession → save_session_plan. Null on failure (see `error`). */
  create: (pathId: string, minutes: number, replace?: boolean) => Promise<StudySession | null>;
  /** shortenPlan on the session's plan, saved over today's open session. Null on failure. */
  shorten: (pathId: string, session: StudySession, minutes: number) => Promise<StudySession | null>;
}

const DEFAULT_FNS: PlannerFns = { plan: planSession, shorten: shortenPlan };

/** Planner is pure and lives in @linguo/shared; this hook feeds it the server inputs and saves its plan. */
export function usePlanner(fns: Partial<PlannerFns> = {}): PlannerApi {
  const plan = fns.plan ?? DEFAULT_FNS.plan;
  const shortenFn = fns.shorten ?? DEFAULT_FNS.shorten;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const run = useCallback(async (job: (client: NonNullable<ReturnType<typeof getSupabase>>) => Promise<StudySession>) => {
    if (running.current) return null;
    const client = getSupabase();
    if (!client) {
      setError(sessionErrorMessage(new Error('supabase_unavailable')));
      return null;
    }
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      return await job(client);
    } catch (e: unknown) {
      setError(sessionErrorMessage(e));
      return null;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);

  const create = useCallback(
    (pathId: string, minutes: number, replace = false) =>
      run(async (client) => {
        const inputs = await getSessionInputs(client, pathId);
        let next: SessionPlan;
        try {
          next = plan(inputs, minutes);
        } catch {
          throw new Error('planner_failed');
        }
        return saveSessionPlan(client, pathId, next, replace);
      }),
    [run, plan],
  );

  const shorten = useCallback(
    (pathId: string, session: StudySession, minutes: number) =>
      run(async (client) => {
        let next: SessionPlan;
        try {
          next = shortenFn(session.plan, minutes);
        } catch {
          throw new Error('planner_failed');
        }
        return saveSessionPlan(client, pathId, next, true);
      }),
    [run, shortenFn],
  );

  return { busy, error, create, shorten };
}
