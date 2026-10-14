import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FORBIDDEN_REMINDER_PHRASES } from '@linguo/shared';

// Spec 10 §5: reminder copy never guilts the learner. Scans every string in features/notifications, the reminder UI
// and the reminders migration (when another task has added it) for the forbidden phrases, case-insensitively.

const NOTIFICATION_FILES = import.meta.glob<string>(['./**/*.{ts,tsx}', '!./forbidden-phrases.test.ts'], { query: '?raw', import: 'default', eager: true });
const UI_FILES = import.meta.glob<string>(
  [
    '../../components/notifications/*.tsx',
    '../../routes/app/notifications/*.tsx',
    '../../routes/app/settings/RemindersSection*.tsx',
    '../../routes/app/home/WeeklySummaryCard*.tsx',
  ],
  { query: '?raw', import: 'default', eager: true },
);

const MIGRATION_FILE = '20261015000300_reminders.sql';

/** The reminders migration, found by walking up from the package directory; empty until it exists. */
function readMigration(): Record<string, string> {
  let dir = process.cwd();
  for (let depth = 0; depth < 5; depth += 1) {
    const path = join(dir, 'supabase', 'migrations', MIGRATION_FILE);
    if (existsSync(path)) return { [path]: readFileSync(path, 'utf8') };
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) break;
    dir = dirname(dir);
  }
  return {};
}
const MIGRATIONS = readMigration();

const normalize = (text: string) => text.normalize('NFC').toLocaleLowerCase('vi');

function findForbidden(files: Record<string, string>): string[] {
  return Object.entries(files).flatMap(([path, text]) => {
    const body = normalize(text);
    return FORBIDDEN_REMINDER_PHRASES.filter((phrase) => body.includes(normalize(phrase))).map((p) => `${path}: "${p}"`);
  });
}

describe('forbidden reminder phrases', () => {
  it('matches case-insensitively', () => {
    expect(findForbidden({ 'x.ts': 'Đừng Bỏ Cuộc nhé' })).toEqual(['x.ts: "đừng bỏ cuộc"']);
  });

  it('never appear in features/notifications or the reminder UI', () => {
    expect(Object.keys(NOTIFICATION_FILES).length).toBeGreaterThan(10);
    expect(Object.keys(UI_FILES).length).toBeGreaterThanOrEqual(4);
    expect(findForbidden({ ...NOTIFICATION_FILES, ...UI_FILES })).toEqual([]);
  });

  // The migration belongs to another task; until it lands there is nothing to scan.
  it.skipIf(Object.keys(MIGRATIONS).length === 0)('never appear in the reminders migration', () => {
    expect(findForbidden(MIGRATIONS)).toEqual([]);
  });
});
