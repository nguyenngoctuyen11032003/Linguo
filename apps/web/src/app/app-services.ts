import type { ComponentType, ReactNode } from 'react';
import { connectErrorReporting } from '@/lib/error-reporting';
import { onIdle } from '@/lib/prefetch';
import type { AppSupabaseClient } from '@/lib/supabase';
import { loadSupabase } from '@/lib/supabase-loader';

/**
 * The data layer every signed-in screen needs, kept out of the entry chunk so the landing page (and its first paint)
 * downloads none of it: the Supabase client (@supabase/supabase-js) and the analytics queue with the shared zod
 * contracts it validates with (zod).
 *
 * It loads in parallel with the route chunks, never after them: every lazy route that may talk to Supabase awaits
 * loadAppServices() next to its own import (router.tsx), and React Router starts those for the initial URL as soon
 * as the router is created. Screens that need none of it (landing, legal pages, 404) get it on idle instead
 * (whenAppServicesReady), and the idle prefetch of /dang-nhap warms it too. All chunks stay in the SW precache.
 *
 * Order matters for analytics: the AnalyticsProvider and the error-reporting sink are installed before this promise
 * resolves, and the AuthProvider only resolves the session after it, so analytics is configured before any
 * signed-in screen (RouteTracker's first page_view) can mount, exactly as when it all sat in the entry chunk.
 */

type AnalyticsProviderType = ComponentType<{ children: ReactNode }>;

let pending: Promise<AppSupabaseClient | null> | null = null;
let analyticsProvider: AnalyticsProviderType | null = null;
const listeners = new Set<(provider: AnalyticsProviderType) => void>();
let markReady: (client: AppSupabaseClient | null) => void = () => undefined;
const ready = new Promise<AppSupabaseClient | null>((resolve) => {
  markReady = resolve;
});

/** Loads the Supabase client and the analytics layer once; a failed load is retried on the next call. */
export function loadAppServices(): Promise<AppSupabaseClient | null> {
  pending ??= Promise.all([loadSupabase(), import('@/features/analytics/AnalyticsProvider'), import('@/lib/error-reporting-sink')]).then(
    ([client, analytics, errors]) => {
      connectErrorReporting(errors.errorReportingSink);
      if (!analyticsProvider) {
        analyticsProvider = analytics.AnalyticsProvider;
        for (const listener of listeners) listener(analytics.AnalyticsProvider);
      }
      markReady(client);
      return client;
    },
    (error: unknown) => {
      pending = null;
      throw error;
    },
  );
  return pending;
}

/**
 * For the AuthProvider: resolves once the services are loaded, by a route loader right away or here when the
 * browser is idle. Never rejects; after a failed load it keeps waiting for the retry (the route shows RouteError).
 */
export function whenAppServicesReady(): Promise<AppSupabaseClient | null> {
  onIdle(() => void loadAppServices().catch(() => undefined));
  return ready;
}

/** The AnalyticsProvider once loaded (null before), and a subscription for when it arrives. */
export function loadedAnalyticsProvider(): AnalyticsProviderType | null {
  return analyticsProvider;
}

export function onAnalyticsProviderLoaded(listener: (provider: AnalyticsProviderType) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
