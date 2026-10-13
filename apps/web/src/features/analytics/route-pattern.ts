/** Longest route accepted by track_events. */
export const ANALYTICS_ROUTE_MAX = 80;

export interface RouteMatchLike {
  pathname: string;
  params: Readonly<Record<string, string | undefined>>;
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Turns the deepest router match into its pattern, e.g. "/app/hoc-tap/bai/3f2…" with { lessonId } →
 * "/app/hoc-tap/bai/:lessonId". Splat tails become "*". Never contains ids, a query or a hash.
 */
export function routePattern(match: RouteMatchLike): string {
  let segments = match.pathname.split('/').filter(Boolean);
  const splat = match.params['*'];
  if (splat) {
    const tail = splat.split('/').filter(Boolean).length;
    segments = [...segments.slice(0, Math.max(0, segments.length - tail)), '*'];
  }
  const nameByValue = new Map<string, string>();
  for (const [key, value] of Object.entries(match.params)) {
    if (key !== '*' && value) nameByValue.set(value, key);
  }
  const pattern = segments.map((segment) => {
    const name = nameByValue.get(decode(segment)) ?? nameByValue.get(segment);
    return name ? `:${name}` : segment;
  });
  return `/${pattern.join('/')}`.slice(0, ANALYTICS_ROUTE_MAX);
}
