import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';

export const SUPABASE_URL = 'https://e2e.invalid';
export const USER_ID = '11111111-1111-4111-8111-111111111111';
const STORAGE_KEY = 'sb-e2e-auth-token'; // supabase-js: sb-<first host label>-auth-token

interface FixtureLevel {
  levelCode: string;
  ordinal: number;
  cumulativeHours: number;
}
const ESTIMATE_FIXTURES = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../packages/shared/src/learning/estimate.fixtures.json', import.meta.url)), 'utf8'),
) as { referenceHours: Record<string, FixtureLevel[]> };

const REFERENCE_ROWS = Object.entries(ESTIMATE_FIXTURES.referenceHours).flatMap(([language, levels]) =>
  levels.map((l) => ({ language_code: language, level_code: l.levelCode, ordinal: l.ordinal, cumulative_hours: l.cumulativeHours, reviewed: false })),
);

const ESTIMATE = {
  hours_needed: 185,
  weeks_min: 43,
  weeks_mid: 53,
  weeks_max: 69,
  feasibility: 'no_deadline',
  suggested_minutes_per_day: null,
  suggested_date: null,
  assumptions: { weekly_minutes: 210, hours_needed: 185, reference_reviewed: false, multiplier_range: [0.8, 1.3] },
};

export function pathRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'path-en',
    user_id: USER_ID,
    language_code: 'en',
    start_point: 'some',
    goal_type: 'daily_communication',
    current_level: 'a2',
    target_level: 'b1',
    weekly_minutes: [30, 30, 30, 30, 30, 30, 30],
    target_date: null,
    status: 'active',
    estimate: ESTIMATE,
    created_at: '2026-10-13T01:00:00Z',
    updated_at: '2026-10-13T01:00:00Z',
    ...overrides,
  };
}

interface MockOptions {
  displayName?: string;
  /** Learning path rows; defaults to one English path so existing app tests keep their home screen. */
  paths?: Array<Record<string, unknown>>;
}

/** Answer every Supabase request so tests never touch a real backend. Paths and the current id are stateful. */
export async function mockSupabase(page: Page, opts: MockOptions = {}) {
  const paths = (opts.paths ?? [pathRow()]).map((p) => ({ ...p }));
  let currentId = (paths[0]?.id as string | undefined) ?? null;

  await page.route(`${SUPABASE_URL}/**`, async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const body = () => (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    switch (url.pathname) {
      case '/rest/v1/profiles':
        if (method === 'GET') {
          return route.fulfill({
            json: { id: USER_ID, display_name: opts.displayName ?? 'Minh Anh', timezone: 'Asia/Ho_Chi_Minh', current_learning_path_id: currentId },
          });
        }
        return route.fulfill({ json: [{ id: USER_ID }] });
      case '/rest/v1/user_preferences':
        if (method === 'GET') return route.fulfill({ json: { theme: 'system', reduce_motion: false } });
        return route.fulfill({ json: [{ user_id: USER_ID }] });
      case '/rest/v1/learning_paths':
        return route.fulfill({ json: paths.filter((p) => p.status !== 'archived') });
      case '/rest/v1/level_reference_hours':
        return route.fulfill({ json: REFERENCE_ROWS });
      case '/rest/v1/rpc/create_learning_path': {
        const b = body();
        const row = pathRow({
          id: `path-${String(b.p_language)}`,
          language_code: b.p_language,
          start_point: b.p_start_point,
          goal_type: b.p_goal_type,
          current_level: b.p_current_level,
          target_level: b.p_target_level,
          weekly_minutes: b.p_weekly_minutes,
          target_date: b.p_target_date ?? null,
          created_at: new Date().toISOString(),
        });
        paths.push(row);
        currentId = row.id as string;
        return route.fulfill({ json: row });
      }
      case '/rest/v1/rpc/set_current_learning_path':
        currentId = String(body().p_id);
        return route.fulfill({ status: 204, body: '' });
      case '/rest/v1/rpc/set_learning_path_status': {
        const b = body();
        const row = paths.find((p) => p.id === b.p_id);
        if (!row) return route.fulfill({ status: 400, json: { code: 'P0001', message: 'path_not_found' } });
        row.status = b.p_status;
        return route.fulfill({ json: row });
      }
      case '/rest/v1/rpc/update_learning_path_plan': {
        const b = body();
        const row = paths.find((p) => p.id === b.p_id);
        if (!row) return route.fulfill({ status: 400, json: { code: 'P0001', message: 'path_not_found' } });
        Object.assign(row, { goal_type: b.p_goal_type, target_level: b.p_target_level, weekly_minutes: b.p_weekly_minutes, target_date: b.p_target_date ?? null });
        return route.fulfill({ json: row });
      }
    }
    if (url.pathname.startsWith('/auth/v1/logout')) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ status: 404, json: { message: `not mocked: ${method} ${url.pathname}` } });
  });
}

function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature`;
}

/** Seed a valid-looking session in localStorage before the app boots. */
export async function signIn(page: Page) {
  const now = Math.floor(Date.now() / 1000);
  const user = {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'minhanh@example.com',
    app_metadata: { provider: 'email' },
    user_metadata: { display_name: 'Minh Anh' },
    created_at: new Date().toISOString(),
  };
  const session = {
    access_token: fakeJwt({ sub: USER_ID, role: 'authenticated', aud: 'authenticated', email: user.email, exp: now + 3600 }),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: 'e2e-refresh-token',
    user,
  };
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(session)] as const);
}

export async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, 'page must not scroll horizontally').toBeLessThanOrEqual(innerWidth);
}
