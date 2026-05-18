/**
 * Lecture de la locale active depuis le cookie plio_lang. Helpers server
 * + client. Validation stricte : si cookie inconnu, retombe sur fr default.
 */

import { DEFAULT_LOCALE, ALL_LOCALES, type Locale } from './messages';

export const LOCALE_COOKIE_NAME = 'plio_lang';
/** 1 an. Lang sticky. */
export const LOCALE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/** Sanitize une string en Locale valide ou retombe sur default. */
export function parseLocale(raw: string | undefined | null): Locale {
  if (!raw) return DEFAULT_LOCALE;
  const lower = raw.toLowerCase();
  if ((ALL_LOCALES as string[]).includes(lower)) return lower as Locale;
  // Accept-Language style "en-US" → on prend juste le préfix
  const prefix = lower.split('-')[0];
  if ((ALL_LOCALES as string[]).includes(prefix)) return prefix as Locale;
  return DEFAULT_LOCALE;
}

/**
 * Détecte la locale serveur depuis le cookie. À utiliser dans les Server
 * Components. Wrap try/catch parce que cookies() peut throw hors d'un
 * request context (build-time pre-render).
 */
export async function getServerLocale(): Promise<Locale> {
  try {
    const { cookies } = await import('next/headers');
    const store = await cookies();
    return parseLocale(store.get(LOCALE_COOKIE_NAME)?.value);
  } catch {
    return DEFAULT_LOCALE;
  }
}
