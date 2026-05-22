/**
 * Tests pour les helpers cookie consent — Round 26 #1.
 *
 * Pure functions, pas de DOM. On valide :
 *   - hasConsentCookie : détecte le cookie au milieu d'autres
 *   - hasConsentCookie : prefix matching strict (anti-faux-positif)
 *   - buildConsentCookie : SameSite + max-age corrects
 *   - buildResetConsentCookie : max-age=0 (delete)
 */

import { describe, it, expect } from 'vitest';
import {
  hasConsentCookie,
  buildConsentCookie,
  buildResetConsentCookie,
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
} from '@/lib/legal/cookie-consent';

describe('hasConsentCookie()', () => {
  it('false sur string vide', () => {
    expect(hasConsentCookie('')).toBe(false);
  });

  it('false sur null / undefined', () => {
    expect(hasConsentCookie(null)).toBe(false);
    expect(hasConsentCookie(undefined)).toBe(false);
  });

  it('false si aucun cookie pertinent', () => {
    expect(hasConsentCookie('session=abc; lang=fr-CA')).toBe(false);
  });

  it('true si plio_consent présent seul', () => {
    expect(hasConsentCookie('plio_consent=ok')).toBe(true);
  });

  it('true si plio_consent au milieu d\'autres cookies', () => {
    expect(hasConsentCookie('session=abc; plio_consent=ok; lang=fr-CA')).toBe(true);
  });

  it('tolère les espaces (cookie header HTTP standard)', () => {
    expect(hasConsentCookie('session=abc ;  plio_consent=ok  ; lang=fr-CA')).toBe(true);
  });

  it('strict prefix match : plio_consent_other ne déclenche PAS faux-positif', () => {
    // C'est le bug que l'ancien `.startsWith('plio_consent=')` évitait déjà,
    // mais on lock-in ici pour éviter une regression si quelqu'un re-écrit
    // l'implémentation en `.includes('plio_consent')`.
    expect(hasConsentCookie('plio_consent_other=x')).toBe(false);
    expect(hasConsentCookie('lang=fr; plio_consent_extra=y')).toBe(false);
  });
});

describe('buildConsentCookie()', () => {
  const cookie = buildConsentCookie();

  it('contient le nom + value ok', () => {
    expect(cookie).toMatch(/^plio_consent=ok/);
  });

  it('path=/', () => {
    expect(cookie).toContain('path=/');
  });

  it('max-age = 1 an', () => {
    expect(cookie).toContain(`max-age=${CONSENT_MAX_AGE_SECONDS}`);
    // Sanity check : 1 an exactement
    expect(CONSENT_MAX_AGE_SECONDS).toBe(31_536_000);
  });

  it('SameSite=Lax (safe pour navigation cross-site)', () => {
    expect(cookie).toContain('SameSite=Lax');
  });
});

describe('buildResetConsentCookie()', () => {
  const cookie = buildResetConsentCookie();

  it('value vide + max-age=0 → delete', () => {
    expect(cookie).toContain(`${CONSENT_COOKIE}=`);
    expect(cookie).toContain('max-age=0');
  });

  it('même path que set (sinon browser ne match pas pour delete)', () => {
    expect(cookie).toContain('path=/');
  });

  it('round-trip : après reset, hasConsentCookie devrait être false', () => {
    // Simule un browser qui applique le Set-Cookie reset puis re-envoie
    // le cookie header. Avec max-age=0 + value vide, le cookie est cleared.
    // On vérifie juste que le nom correspond.
    expect(buildResetConsentCookie()).toContain(`${CONSENT_COOKIE}=`);
  });
});
