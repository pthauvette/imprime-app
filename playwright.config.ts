/**
 * Playwright config — E2E tests pour Plio.
 *
 * Stratégie :
 *   - Par défaut, target = http://localhost:3000 (dev local)
 *   - Override avec E2E_BASE_URL pour cibler staging/prod
 *   - GH Actions workflow .github/workflows/e2e.yml tape https://www.plio.ca
 *   - Chromium uniquement (couvre 70%+ du trafic web ; ajouter Firefox/WebKit
 *     plus tard si on attrape des bugs spécifiques)
 *
 * Tests divisés en 2 catégories :
 *   - smoke.spec.ts : pages publiques rendent + interactions de base
 *   - happy-path.spec.ts : full wizard de commande (steps 1-7) — certaines
 *     étapes skip() en attente de helpers test (magic link auth, Stripe
 *     test card injection automatique)
 */

import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const IS_CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60_000, // 60s par test — wizard a beaucoup d'étapes

  // Retry une fois en CI pour les flakies réseau ; pas en local
  retries: IS_CI ? 1 : 0,

  // Parallel local pour itérer vite ; séquentiel en CI pour pas DoS prod
  workers: IS_CI ? 1 : undefined,

  reporter: IS_CI
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    // Screenshots + traces seulement si fail — économise du disk
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    // Locale fr-CA pour matcher le contenu du site
    locale: 'fr-CA',
    timezoneId: 'America/Montreal',
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    // À décommenter quand on veut tester mobile
    // { name: 'chromium-mobile', use: { ...devices['Pixel 5'] } },
  ],
});
