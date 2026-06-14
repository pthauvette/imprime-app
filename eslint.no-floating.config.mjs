// Config ESLint ISOLÉE — uniquement `no-floating-promises` sur le code SERVEUR.
//
// Vise le modèle de menace réel de Plio : une promesse flottante GÈLE sur
// Amplify/Lambda après la réponse (leçon #322-324, cf. CLAUDE.md). Le code
// CLIENT est hors scope (le navigateur ne gèle pas → `void fetch()` y est OK).
//
// Volontairement séparé de toute config ESLint générale (le repo n'en a pas) :
// un garde déterministe, ciblé, lançable via `pnpm lint:no-floating` et
// branchable dans la CI sans imposer un lint complet à 473 fichiers.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    files: ['src/app/api/**/*.{ts,tsx}', 'src/lib/**/*.{ts,tsx}'],
    // On n'active QUE no-floating-promises ; les // eslint-disable existants
    // (pour d'autres règles non chargées ici) ne doivent pas être signalés
    // « inutilisés » — sinon le seul vrai signal se noie dans le bruit.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-floating-promises': [
        'error',
        { ignoreVoid: false }, // `void p` ne suffit PAS à exempter : sur Lambda il gèle quand même
      ],
    },
  },
  {
    // Tests + fichiers client de src/lib (le navigateur ne gèle pas).
    ignores: [
      '**/*.test.ts',
      '**/*.test.tsx',
      'src/lib/theme-shared.ts',
      'src/lib/a11y/useFocusTrap.ts',
    ],
  },
);
