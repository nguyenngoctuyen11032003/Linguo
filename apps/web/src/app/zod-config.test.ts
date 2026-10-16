import { describe, expect, it } from 'vitest';

describe('zod-config', () => {
  it('turns zod jitless through the global config zod adopts', async () => {
    await import('./zod-config');
    const { config, z } = await import('zod');
    expect(config().jitless).toBe(true);
    expect((globalThis as { __zod_globalConfig?: unknown }).__zod_globalConfig).toBe(config());
    expect(z.object({ a: z.string() }).safeParse({ a: 'x' }).success).toBe(true);
  });
});
