import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** Classes a native select needs inside SelectChevron: room for the arrow, and long options end in "…". */
export const SELECT_WITH_CHEVRON = 'appearance-none truncate pr-11';

/** Wraps an `appearance-none` select so it still shows a dropdown arrow. */
export function SelectChevron({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <ChevronDown aria-hidden className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
    </div>
  );
}
