/**
 * Tests pour lib/i18n — translate() + parseLocale().
 */

import { describe, it, expect } from 'vitest';
import { translate } from '@/lib/i18n/messages';
import { parseLocale } from '@/lib/i18n/locale';

describe('translate', () => {
  it('retourne fr par défaut', () => {
    expect(translate('fr', 'nav.products')).toBe('Produits');
    expect(translate('fr', 'hero.cta.primary')).toBe('Démarrer une commande');
  });

  it('retourne en quand la locale est en', () => {
    expect(translate('en', 'nav.products')).toBe('Products');
    expect(translate('en', 'hero.cta.primary')).toBe('Start an order');
  });

  it('chaque clé fr a une trad en (typecheck strict)', () => {
    // Le type Messages = typeof fr impose en : typeof fr, donc TS catch
    // au build. Ici on smoke-test une poignée pour confirmer runtime.
    const keys = ['nav.products', 'nav.signIn', 'hero.title', 'footer.tagline', 'lang.fr'] as const;
    for (const k of keys) {
      expect(translate('en', k).length).toBeGreaterThan(0);
      expect(translate('fr', k).length).toBeGreaterThan(0);
    }
  });
});

describe('parseLocale', () => {
  it('fr par défaut si undefined', () => {
    expect(parseLocale(undefined)).toBe('fr');
    expect(parseLocale(null)).toBe('fr');
    expect(parseLocale('')).toBe('fr');
  });

  it('fr pour "fr" et "FR"', () => {
    expect(parseLocale('fr')).toBe('fr');
    expect(parseLocale('FR')).toBe('fr');
  });

  it('en pour "en" et "EN"', () => {
    expect(parseLocale('en')).toBe('en');
    expect(parseLocale('EN')).toBe('en');
  });

  it('extrait le préfix pour fr-CA / en-US (Accept-Language style)', () => {
    expect(parseLocale('fr-CA')).toBe('fr');
    expect(parseLocale('en-US')).toBe('en');
    expect(parseLocale('en-GB')).toBe('en');
  });

  it('fallback fr pour locale inconnue', () => {
    expect(parseLocale('es')).toBe('fr');
    expect(parseLocale('zh-CN')).toBe('fr');
    expect(parseLocale('garbage')).toBe('fr');
  });
});
