import { useEffect, useRef } from 'react';
import { useMatches } from 'react-router';
import { setAnalyticsRoute, track } from './client';
import { routePattern } from './route-pattern';

/** Emits `page_view` once per route pattern change (mounted inside the data router, in AppLayout). */
export function RouteTracker(): null {
  const matches = useMatches();
  const deepest = matches[matches.length - 1];
  const pattern = deepest ? routePattern(deepest) : null;
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!pattern || pattern === last.current) return;
    last.current = pattern;
    setAnalyticsRoute(pattern);
    track('page_view');
  }, [pattern]);

  return null;
}
