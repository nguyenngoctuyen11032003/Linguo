export interface AppEnv {
  supabaseUrl: string;
  supabaseKey: string;
  siteUrl: string;
  googleEnabled: boolean;
  heroVideoUrl: string | null;
  isSupabaseConfigured: boolean;
}

type RawEnv = Record<string, string | boolean | undefined>;

export function readEnv(raw: RawEnv, origin: string): AppEnv {
  const str = (key: string): string => {
    const value = raw[key];
    return typeof value === 'string' ? value.trim() : '';
  };
  const supabaseUrl = str('VITE_SUPABASE_URL').replace(/\/+$/, '');
  const supabaseKey = str('VITE_SUPABASE_PUBLISHABLE_KEY');
  const base = (str('BASE_URL') || '/').replace(/\/+$/, '');
  const siteUrl = (str('VITE_SITE_URL') || `${origin}${base}`).replace(/\/+$/, '');
  return {
    supabaseUrl,
    supabaseKey,
    siteUrl,
    googleEnabled: str('VITE_AUTH_GOOGLE_ENABLED') === 'true',
    heroVideoUrl: str('VITE_HERO_VIDEO_URL') || null,
    isSupabaseConfigured: /^https?:\/\/.+/.test(supabaseUrl) && supabaseKey.length > 0,
  };
}

export const env: AppEnv = readEnv(
  import.meta.env as unknown as RawEnv,
  typeof window === 'undefined' ? 'http://localhost:5173' : window.location.origin,
);
