/**
 * auth.ts — backward-compatibility bridge for callers using the legacy import path.
 *
 * The implementation now lives under `auth/` (split by responsibility per the
 * auth-and-ecosystem spec, P1.3). This file just re-exports the public surface
 * so existing `import { ... } from "./auth.js"` lines keep working unchanged.
 *
 * New code should import directly from `./auth/index.js` or specific submodules.
 */
export * from "./auth/index.js";
