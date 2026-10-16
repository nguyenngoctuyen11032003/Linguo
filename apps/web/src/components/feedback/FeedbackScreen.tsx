import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { RouteIllustration, type RouteIllustrationVariant } from './RouteIllustration';

export type FeedbackTone = 'error' | 'primary' | 'accent';

const TONE_TEXT: Record<FeedbackTone, string> = {
  error: 'text-error-text',
  primary: 'text-primary',
  accent: 'text-accent-text',
};
const TONE_GLOW: Record<FeedbackTone, string> = {
  error: 'bg-error/16',
  primary: 'bg-primary/20',
  accent: 'bg-accent/16',
};

interface FeedbackScreenProps {
  /** Big condensed display line ("404", "Ối!"): decorative, hidden from assistive tech. */
  display: string;
  illustration: RouteIllustrationVariant;
  tone: FeedbackTone;
  eyebrowIcon: LucideIcon;
  eyebrow: string;
  title: string;
  description: ReactNode;
  /** Extra content between the text and the actions (e.g. a dev-only stack). */
  children?: ReactNode;
  actions: ReactNode;
  /** Small line under the actions, e.g. the error code. */
  footnote?: ReactNode;
  role?: 'alert';
}

/** Full-page state (route error, 404, new version): illustration, display word, h1, copy, actions. */
export function FeedbackScreen({
  display,
  illustration,
  tone,
  eyebrowIcon: Icon,
  eyebrow,
  title,
  description,
  children,
  actions,
  footnote,
  role,
}: FeedbackScreenProps) {
  return (
    <div role={role} className="relative isolate mx-auto w-full max-w-md">
      <div
        aria-hidden="true"
        className={cn('pointer-events-none absolute -top-10 left-1/2 -z-10 size-80 -translate-x-1/2 rounded-full blur-3xl', TONE_GLOW[tone])}
      />
      <div aria-hidden="true" className="relative">
        <p className="stat-num text-gradient-fade -ml-1 pt-[0.12em] text-[clamp(120px,40vw,176px)]">{display}</p>
        <RouteIllustration variant={illustration} className="absolute -bottom-3 right-0 w-[min(58%,14rem)]" />
      </div>
      <div className={cn('mt-4 flex items-center gap-2', TONE_TEXT[tone])}>
        <Icon aria-hidden className="size-5" />
        <span className="text-xs font-semibold uppercase tracking-[0.08em]">{eyebrow}</span>
      </div>
      <h1 className="page-title mt-2">{title}</h1>
      <div className="mt-3.5 max-w-sm text-pretty text-[15px] leading-relaxed text-muted">{description}</div>
      {children}
      <div className="mt-7 grid w-full gap-2.5">{actions}</div>
      {footnote && <p className="mt-5 text-xs text-muted">{footnote}</p>}
    </div>
  );
}
