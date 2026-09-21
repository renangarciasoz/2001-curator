import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
    // Mesma condição que o Next usa para código de servidor: sem ela o import
    // de `server-only` resolve para o módulo que lança, e todo teste quebra.
    conditions: ['react-server'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
