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

export async function getServerTheme(): Promise<Theme> {
  const c = await cookies();
  const v = c.get(THEME_COOKIE)?.value;
  if (v === 'dark') return 'dark';
  return 'light';
}
