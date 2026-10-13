import type { ReactNode } from 'react';
import { SolidCard } from '@/components/ui/SolidCard';

interface AuthCardProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">{title}</h1>
        {subtitle && <p className="text-[15px] leading-relaxed text-muted">{subtitle}</p>}
      </div>
      <SolidCard className="space-y-5 p-6">{children}</SolidCard>
      {footer && <div className="text-center text-[15px] text-muted">{footer}</div>}
    </div>
  );
}

export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-2xl border border-error/30 bg-error/10 px-4 py-3 text-[15px] text-error">
      {children}
    </p>
  );
}

export const textLinkClass = 'inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline';
