import { describe, expect, it } from 'vitest';
import { readEnv } from './env';

describe('readEnv', () => {
  it('is unconfigured when Supabase vars are missing', () => {
    const env = readEnv({ BASE_URL: '/' }, 'http://localhost:5173');
    expect(env.isSupabaseConfigured).toBe(false);
    expect(env.siteUrl).toBe('http://localhost:5173');
    expect(env.googleEnabled).toBe(false);
    expect(env.heroVideoUrl).toBeNull();
  });

  it('reads and normalizes configured values', () => {
    const env = readEnv(
      {
        BASE_URL: '/Linguo/',
        VITE_SUPABASE_URL: ' https://abc.supabase.co/ ',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
        VITE_AUTH_GOOGLE_ENABLED: 'true',
        VITE_HERO_VIDEO_URL: 'https://cdn.example.com/hero.mp4',
      },
      'https://user.github.io',
    );
    expect(env.isSupabaseConfigured).toBe(true);
    expect(env.supabaseUrl).toBe('https://abc.supabase.co');
    expect(env.siteUrl).toBe('https://user.github.io/Linguo');
    expect(env.googleEnabled).toBe(true);
    expect(env.heroVideoUrl).toBe('https://cdn.example.com/hero.mp4');
  });

  it('prefers VITE_SITE_URL and strips trailing slashes', () => {
    const env = readEnv({ BASE_URL: '/', VITE_SITE_URL: 'https://lexipath.vn/' }, 'http://x');
    expect(env.siteUrl).toBe('https://lexipath.vn');
  });
});
