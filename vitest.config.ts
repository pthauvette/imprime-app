import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // tsconfig a `jsx: "preserve"` (standard Next) → sans override, le JSX des
  // tests .tsx (et des composants qu'ils importent) n'est pas transformé
  // (« Unexpected JSX expression » au parse rolldown). Vite 8 = rolldown-vite :
  // la transform se configure via `oxc.jsx` (l'option `esbuild` est ignorée).
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    globals: false,
    // .tsx inclus : les tests de rendu de composants (ex. unicité des mockups
    // produits) doivent écrire du JSX — un test .ts ne peut pas importer un
    // composant .tsx (transform jsx absent hors glob).
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
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
