import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface PageHeaderProps {
  title: ReactNode;
  lede?: ReactNode;
  eyebrow?: ReactNode;
  /** Right-aligned controls (range toggle, primary action). */
  actions?: ReactNode;
  className?: string;
}

/** Shared header of the account pages: eyebrow, display h1, lede and actions, closed by a hairline (see .page-header). */
export function PageHeader({
  title,
  lede,
  eyebrow,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("page-header reveal", className)}>
      <div className="min-w-0">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 className="page-title-lg">{title}</h1>
        {lede && <p>{lede}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}
