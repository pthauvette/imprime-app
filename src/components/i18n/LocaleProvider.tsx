'use client';

/**
 * Context provider qui expose la locale active + helper t() côté client.
 * Initialisé avec la valeur lue server-side dans root layout (props
 * `initialLocale`).
 *
 * Pour utiliser dans un client component :
 *   const { t, locale } = useT();
 *   <h1>{t('hero.title')}</h1>
 */

import { createContext, useContext, useMemo } from 'react';
import { translate, type Locale, type MessageKey } from '@/lib/i18n/messages';

interface LocaleContextValue {
  locale: Locale;
  t: (key: MessageKey) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const value = useMemo<LocaleContextValue>(
    () => ({
      locale: initialLocale,
      t: (key: MessageKey) => translate(initialLocale, key),
    }),
    [initialLocale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/**
 * Hook client pour accéder à la locale + traduire. Throw si appelé hors
 * du LocaleProvider (signale un bug — toutes les pages devraient être
 * wrappées via root layout).
 */
export function useT(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useT must be used within a LocaleProvider');
  }
  return ctx;
}
