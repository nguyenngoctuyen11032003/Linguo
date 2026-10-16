import { useEffect, useState, type CSSProperties } from 'react';
import { BootVisual } from '@/components/feedback/BootVisual';
import { LOADING_TIPS } from '@/components/feedback/tips';

/** A tip only appears once a load has visibly lasted this long, so fast loads never flash text. */
const TIP_AFTER_MS = 1200;
const TIP_EVERY_MS = 4500;

/** True until the first loader has mounted: that one takes over from the boot splash in index.html. */
let continuesSplash = true;
/** Successive loaders start on the next tip instead of repeating the first one. */
let tipCursor = 0;

/** Time the splash has been on screen, from the first paint (when its CSS animations started). */
function splashElapsed(): number {
  if (!continuesSplash || typeof performance === 'undefined') return 0;
  const paint = performance.getEntriesByType?.('paint')[0];
  return paint ? Math.max(0, performance.now() - paint.startTime) : 0;
}

/**
 * Full-screen brand loader. The first one continues the boot splash (same markup and feedback.css classes, its
 * animations resumed at the splash's phase), so the handoff from static HTML to React is invisible. CSS-only motion:
 * this sits on the entry path.
 */
export function FullScreenLoader({ label = 'Đang tải…' }: { label?: string }) {
  const [elapsed] = useState(splashElapsed);
  const [tip, setTip] = useState<number | null>(null);

  useEffect(() => {
    continuesSplash = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    const show = () => {
      setTip(tipCursor % LOADING_TIPS.length);
      tipCursor += 1;
    };
    const timeout = setTimeout(
      () => {
        show();
        interval = setInterval(show, TIP_EVERY_MS);
      },
      Math.max(0, TIP_AFTER_MS - elapsed),
    );
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [elapsed]);

  const current = tip === null ? null : LOADING_TIPS[tip];
  // CSSOM custom property (allowed by the CSP, unlike a style="" attribute in HTML).
  const sync = elapsed > 0 ? ({ '--lg-sync': `-${Math.round(elapsed)}ms` } as CSSProperties) : undefined;

  return (
    <div role="status" className={sync ? 'lg-boot lg-boot--resume' : 'lg-boot'} style={sync}>
      <div className="lg-boot__stage">
        <BootVisual />
        <p className="lg-boot__label">{label}</p>
        <p className="lg-boot__tip" aria-hidden="true">
          {current && (
            <span key={tip}>
              <b>{current.lead}</b> {current.text}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
