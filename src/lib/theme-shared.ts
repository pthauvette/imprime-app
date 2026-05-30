/**
 * Theme constants + types — CLIENT-SAFE (no server-only imports).
 *
 * Séparé de theme.ts parce que ce dernier importe `next/headers` (server-only)
 * pour getServerTheme(). Avant ce split, le composant client ThemeToggle
 * importait THEME_COOKIE depuis theme.ts → webpack tirait next/headers dans
 * le bundle client → `next build` échouait avec :
 *   "You're importing a component that needs next/headers. That only works
 *    in a Server Component..."
 *
 * Règle Next.js App Router : tout le graphe d'import d'un module 'use client'
 * doit être client-safe. Les constantes/types vivent donc ici ; theme.ts les
 * re-exporte pour les consommateurs serveur + ajoute getServerTheme().
 */

export const THEME_COOKIE = 'plio_theme';
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 an

export type Theme = 'light' | 'dark';

export const ALL_THEMES: Theme[] = ['light', 'dark'];
