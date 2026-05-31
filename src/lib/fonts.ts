/**
 * Polices self-hostées via next/font/google — Round 44 #1 (perf).
 *
 * Avant : 3 familles chargées par un <link> bloquant vers
 * fonts.googleapis.com dans <head> (preconnect + CSS + woff2 = plusieurs
 * round-trips réseau AVANT le first paint, + CLS quand la police custom
 * remplaçait le fallback).
 *
 * Maintenant : next/font télécharge les woff2 au build, les sert depuis
 * notre origine (pas de hop tiers), injecte le CSS @font-face inline, et
 * calcule un fallback metric-matched (adjustFontFallback, défaut on) →
 * zéro CLS. display:'swap' (défaut) → texte visible immédiatement.
 *
 * Les 3 polices exposent une CSS variable DÉDIÉE (--font-*-src) que les
 * variables du design system référencent via var() imbriqué :
 *   --font-body: var(--font-body-src, "Inter"), system-ui, ...
 * Noms distincts → zéro collision de cascade avec les :root de globals.css
 * (qui définissent déjà --font-body/display/mono). Les ~1700 usages de
 * var(--font-*) restent intacts ; la stack littérale survit en fallback.
 */

import { Inter, Instrument_Serif, JetBrains_Mono } from 'next/font/google';

// Body — Inter (police variable : plage de poids, pas de `weight` requis).
export const fontBody = Inter({
  subsets: ['latin'],
  variable: '--font-body-src',
  display: 'swap',
  // Fallback aligné sur l'ancienne stack DS (system-ui...) pour cohérence.
  fallback: ['system-ui', '-apple-system', 'sans-serif'],
});

// Display — Instrument Serif (police NON variable : weight 400 explicite
// requis ; on charge aussi l'italique car le DS l'utilise, ex. <em>).
export const fontDisplay = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-display-src',
  display: 'swap',
  fallback: ['Georgia', 'serif'],
});

// Mono — JetBrains Mono (police variable).
export const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-src',
  display: 'swap',
  fallback: ['ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
});

/** className combiné à poser sur <html> pour exposer les 3 variables. */
export const fontVariables = `${fontBody.variable} ${fontDisplay.variable} ${fontMono.variable}`;
