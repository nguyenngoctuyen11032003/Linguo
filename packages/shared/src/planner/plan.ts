import type { SessionInputs, SessionPlan } from './contract';

// Spec 6 §2: pure, deterministic session planner. Implemented by task P2.

/** Builds a session plan of at most `minutes` from the server-provided inputs. */
export function planSession(inputs: SessionInputs, minutes: number): SessionPlan {
  void inputs;
  void minutes;
  throw new Error('planSession: not implemented');
}

/** Keeps the highest-priority activities that fit in `minutes`; trims the last one if needed. */
export function shortenPlan(plan: SessionPlan, minutes: number): SessionPlan {
  void plan;
  void minutes;
  throw new Error('shortenPlan: not implemented');
}
