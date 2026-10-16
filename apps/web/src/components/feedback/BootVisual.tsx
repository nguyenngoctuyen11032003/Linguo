import { useId } from 'react';
import { ROUTE_D, ROUTE_NODES } from './route';

/*
 * The brand + route line shared by the boot splash (static copy in index.html) and FullScreenLoader. Class names and
 * geometry must match index.html exactly so React's first paint lands on the same pixels (feedback.test.tsx checks).
 * Styles: feedback.css.
 */

/** The logo mark (public/brand/logo-mark.svg), inline so it paints without a request. */
export function BrandMark({ className = 'lg-boot__mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path
        d="M32 5C17.1 5 5 15.9 5 29.3c0 7.6 3.9 14.4 10 18.9L12.6 58l11.6-6.3c2.5.6 5.1.9 7.8.9 14.9 0 27-10.9 27-24.3S46.9 5 32 5Z"
        fill="#4CA2D1"
      />
      <path
        d="M27.5 16.5c2.6-2.6 6.3-1.6 6.1 2.2-.3 5.2-6.4 10.4-7.6 17.4-.6 3.3.9 5.4 4.2 5.4h12.3"
        fill="none"
        stroke="#fff"
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M42.5 41.5c4.3 0 7.8 2.6 9.5 6.5 1 2.3 3 3.8 5.5 4" fill="none" stroke="#F37D25" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M47 13.5l1.3 3.2 3.2 1.3-3.2 1.3-1.3 3.2-1.3-3.2-3.2-1.3 3.2-1.3z" fill="#fff" />
    </svg>
  );
}

/** Animated route line: draws node to node, the stops light up as it reaches them. */
export function RouteProgress() {
  const grad = `lg-route-${useId().replace(/:/g, '')}`;
  return (
    <svg className="lg-boot__route" viewBox="0 0 168 36" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={grad} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" className="lg-boot__stop-1" />
          <stop offset="1" className="lg-boot__stop-2" />
        </linearGradient>
      </defs>
      <path className="lg-boot__track" d={ROUTE_D} pathLength={100} />
      <path className="lg-boot__progress" d={ROUTE_D} pathLength={100} stroke={`url(#${grad})`} />
      <path className="lg-boot__head-glow" d={ROUTE_D} pathLength={100} />
      <path className="lg-boot__head" d={ROUTE_D} pathLength={100} />
      {ROUTE_NODES.map(([cx, cy], i) => (
        <circle key={i} className={`lg-boot__node lg-boot__node--${i + 1}`} cx={cx} cy={cy} r="4" />
      ))}
    </svg>
  );
}

/** Brand block: mark, wordmark and route. */
export function BootVisual() {
  return (
    <div className="lg-boot__brand" aria-hidden="true">
      <BrandMark />
      <span className="lg-boot__word">
        Linguo<span>.</span>
      </span>
      <RouteProgress />
    </div>
  );
}
