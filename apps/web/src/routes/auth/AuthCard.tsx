import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface AuthCardProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/** Display title over a glass panel; the layout's ambient glow shows through behind it. */
export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="reveal space-y-6">
      <div className="space-y-2.5">
        <span aria-hidden="true" className="block h-1 w-10 rounded-full bg-gradient-to-r from-primary to-accent" />
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="max-w-sm pt-1.5 text-pretty text-[15px] leading-relaxed text-muted">{subtitle}</p>}
      </div>
      <div className="relative isolate">
        <div aria-hidden="true" className="absolute -right-10 -top-10 -z-10 size-48 rounded-full bg-radial from-primary/25 to-transparent to-70%" />
        <div aria-hidden="true" className="absolute -bottom-12 -left-8 -z-10 size-40 rounded-full bg-radial from-accent/20 to-transparent to-70%" />
        <div className="glass space-y-5 rounded-[1.75rem] p-5 shadow-[var(--card-sheen),var(--shadow-dock)] min-[380px]:p-6">{children}</div>
      </div>
      {footer && <div className="text-center text-[15px] text-muted">{footer}</div>}
    </div>
  );
}

export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2.5 rounded-2xl bg-error/10 px-4 py-3 text-[15px] text-error-text ring-1 ring-error/30 ring-inset">
      <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export const textLinkClass = 'inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline';
