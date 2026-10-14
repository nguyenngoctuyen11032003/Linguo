import { swBasePath } from './register';

/**
 * Router path for an absolute notification URL from the service worker ('https://host/Linguo/app/on-tap?x' →
 * '/app/on-tap?x'). Anything outside this origin or the app's base path, or outside /app, falls back to '/app'.
 */
export function appPathFrom(url: string, origin: string = window.location.origin, base: string = import.meta.env.BASE_URL): string {
  let parsed: URL;
  try {
    parsed = new URL(url, origin);
  } catch {
    return '/app';
  }
  const prefix = swBasePath(base);
  if (parsed.origin !== origin || !parsed.pathname.startsWith(prefix)) return '/app';
  const path = `/${parsed.pathname.slice(prefix.length)}`;
  if (path !== '/app' && !path.startsWith('/app/')) return '/app';
  return `${path}${parsed.search}${parsed.hash}`;
}
