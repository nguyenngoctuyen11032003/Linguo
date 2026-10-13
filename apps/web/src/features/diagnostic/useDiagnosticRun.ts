// placeholder: replaced by Task D6
import type {
  DiagnosticItem,
  DiagnosticMode,
  DiagnosticProgress,
  DiagnosticReport,
  DiagnosticSkill,
  PlacementResult,
} from '@linguo/shared';

export function useDiagnosticRun(pathId: string): {
  status: 'loading' | 'intro' | 'question' | 'submitting' | 'finishing' | 'report' | 'error';
  mode: DiagnosticMode;
  item: DiagnosticItem | null;
  progress: DiagnosticProgress | null;
  error: string | null;
  start: () => void | Promise<void>;
  answer: (choice: string | null) => void | Promise<void>;
  skip: (skill: DiagnosticSkill, reason: 'no_time' | 'too_hard' | 'not_my_goal' | 'other') => void | Promise<void>;
  pause: () => void | Promise<void>;
  finish: () => void | Promise<void>;
  report: DiagnosticReport | null;
  accept: () => Promise<PlacementResult | null>;
  retry: () => void;
} {
  throw new Error(`placeholder: replaced by Task D6 (${pathId})`);
}
