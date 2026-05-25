/**
 * ESLint v9 flat config — Round 38 #5.
 *
 * Augmente le default `next/core-web-vitals` avec :
 *   - no-console : warn (autorise warn/error pour les log structured pino)
 *   - no-restricted-globals : confirm/alert/prompt → erreur (use useConfirmDialog)
 *
 * Pourquoi : audit Round 35 + Round 37 ont identifié 10+ console.log + 11+
 * window.confirm() drifts. Ce config catch les nouveaux avant qu'ils
 * ne s'accumulent. Existing violations sont en warn pour ne pas bloquer
 * le CI ; à fix incrementally.
 */

import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat();

export default [
  ...compat.extends('next/core-web-vitals'),
  {
    rules: {
      // Round 38 #5 — interdire console.log (autorise warn/error/info
      // pour les rares cas debug ; pino logger reste preferred).
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      // Round 38 #5 — bannir les native browser dialogs (UX jarring,
      // unbranded, mobile-unusable, pas de a11y). Use useConfirmDialog.
      'no-restricted-globals': [
        'error',
        {
          name: 'confirm',
          message: 'Use useConfirmDialog() from @/hooks/useConfirmDialog (Round 36 #5).',
        },
        {
          name: 'alert',
          message: 'Use inline error/success banner (Round 30 #5 pattern).',
        },
        {
          name: 'prompt',
          message: 'Use inline form (Round 37 #5 OrderActions pattern).',
        },
      ],
    },
  },
  {
    // Tests can use console freely (debug output OK)
    files: ['tests/**/*.ts', 'tests/**/*.tsx'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // Scripts/migrations/instrumentation can console.log too (bootstrap)
    files: ['src/instrumentation.ts', 'scripts/**/*.ts', 'src/lib/env.ts'],
    rules: {
      'no-console': 'off',
    },
  },
];
