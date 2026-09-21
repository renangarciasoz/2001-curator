import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});

// Note for whoever adds the first test over a module under `src/server`: those
// modules import `server-only`, which resolves to a build that throws outside a
// React Server Component. Next avoids it through the `react-server` export
// condition; Vitest runs in SSR mode, where `resolve.conditions` does not apply.
// Alias `server-only` to a no-op module here rather than reaching for
// `ssr.resolve.conditions`, which replaces Vite's defaults instead of adding to
// them. Pure domain logic — the quality gate, for one — belongs in `src/lib`
// and sidesteps the problem entirely.
