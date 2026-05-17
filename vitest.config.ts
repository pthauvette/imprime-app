import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['node_modules', '.next', 'tests/e2e/**'],
    setupFiles: ['./tests/setup.ts'],
    // Some tests load Prisma-generated files; expand the timeout for the
    // first import (no actual DB calls in unit tests though).
    testTimeout: 10_000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
