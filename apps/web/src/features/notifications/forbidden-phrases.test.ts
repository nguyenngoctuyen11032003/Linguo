import { describe, expect, it } from 'vitest';
import { FORBIDDEN_REMINDER_PHRASES } from '@linguo/shared';

// Spec 10 §5: reminder copy never guilts the learner. Scans every string in features/notifications, the reminder UI
// and the reminders migration (when another task has added it) for the forbidden phrases, case-insensitively.

const NOTIFICATION_FILES = import.meta.glob<string>(['./**/*.{ts,tsx}', '!./forbidden-phrases.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
const UI_FILES = import.meta.glob<string>(
  [
    '../../components/notifications/*.tsx',
    '../../routes/app/notifications/*.tsx',
    '../../routes/app/settings/RemindersSection*.tsx',
    '../../routes/app/home/WeeklySummaryCard*.tsx',
  ],
  { query: '?raw', import: 'default', eager: true },
);

// The migration is read at run time (a glob is expanded once at transform time and cached, so it would miss the file
// once another task adds it). The web tsconfig has no Node types, hence the narrow local ones.
interface NodeFs {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: 'utf8') => string;
}
interface NodePath {
  join: (...parts: string[]) => string;
  dirname: (path: string) => string;
}
const MIGRATION_FILE = '20261015000300_reminders.sql';

async function readMigration(): Promise<Record<string, string>> {
  const fsModule: string = 'node:fs';
  const pathModule: string = 'node:path';
  const fs = (await import(/* @vite-ignore */ fsModule)) as NodeFs;
  const path = (await import(/* @vite-ignore */ pathModule)) as NodePath;
  let dir = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd();
  for (let depth = 0; depth < 5; depth += 1) {
    const file = path.join(dir, 'supabase', 'migrations', MIGRATION_FILE);
    if (fs.existsSync(file)) return { [file]: fs.readFileSync(file, 'utf8') };
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) break;
    dir = path.dirname(dir);
  }
  return {};
}
const MIGRATIONS = await readMigration();

const normalize = (text: string) => text.normalize('NFC').toLocaleLowerCase('vi');

function findForbidden(files: Record<string, string>): string[] {
  return Object.entries(files).flatMap(([file, text]) => {
    const body = normalize(text);
    return FORBIDDEN_REMINDER_PHRASES.filter((phrase) => body.includes(normalize(phrase))).map((p) => `${file}: "${p}"`);
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
