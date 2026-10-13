// Imported first by main.tsx. Zod 4 probes `Function('')` on the first object parse to decide whether to
// JIT-compile parsers; under the CSP (script-src without 'unsafe-eval', build/csp.ts) that probe is reported
// as a violation. jitless skips the probe; the interpreted parsers are plenty fast for this app.
import { config } from 'zod';

config({ jitless: true });
