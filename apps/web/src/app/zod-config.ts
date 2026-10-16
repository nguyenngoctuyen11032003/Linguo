// Imported first by main.tsx. Zod 4 probes `Function('')` on the first object parse to decide whether to
// JIT-compile parsers; under the CSP (script-src without 'unsafe-eval', build/csp.ts) that probe is reported
// as a violation. jitless skips the probe; the interpreted parsers are plenty fast for this app.
//
// zod itself is not in the entry chunk (only lazy chunks build schemas), so this sets zod's global config object
// directly: zod 4 keeps it on `globalThis.__zod_globalConfig` and adopts an existing one (`??=` in
// zod/v4/core/core.js), which is what `config({ jitless: true })` would write. zod-config.test.ts checks that zod
// picks it up, so a zod upgrade that changes this fails the tests rather than the CSP.
const g = globalThis as typeof globalThis & { __zod_globalConfig?: Record<string, unknown> };
g.__zod_globalConfig = Object.assign(g.__zod_globalConfig ?? {}, { jitless: true });

export {};
