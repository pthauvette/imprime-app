/**
 * Theme system : light (default) / dark.
 *
 * Stockage : cookie `plio_theme` (lecture server-side dans layout root),
 * + localStorage côté client pour avoir le toggle sans round-trip.
 * Le cookie permet au SSR de mettre le bon `data-theme` sur <html> et
 * éviter le FOUC.
 */

import { cookies } from 'next/headers';

export const THEME_COOKIE = 'plio_theme';
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 an

export type Theme = 'light' | 'dark';

export const ALL_THEMES: Theme[] = ['light', 'dark'];

/**
 * Choix EXPLICITE du client, ou `null` s'il n'en a jamais fait.
 *
 * ⚠️ Renvoyait `'light'` en l'absence de cookie — donc `<html data-theme="light">`
 * sur TOUTE première visite. Or `data-theme` présent bloque la règle
 * `:root:not([data-theme])` : un visiteur dont l'OS est en sombre recevait le
 * thème clair, et s'il n'était pas connecté il n'avait même pas accès au bouton
 * (il vit dans le menu compte). « Pas de cookie » n'est pas « veut du clair ».
 *
 * `null` → l'attribut est OMIS → la préférence système s'applique. Dès que le
 * client touche au bouton, le cookie pose l'attribut et son choix gagne.
 */
export async function getServerTheme(): Promise<Theme | null> {
  const c = await cookies();
  const v = c.get(THEME_COOKIE)?.value;
  if (v === 'dark' || v === 'light') return v;
  return null;
}
