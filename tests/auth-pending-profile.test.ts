/**
 * Tests pour le parsing du cookie plio_pending_profile (sign-up flow).
 *
 * La logique vit inline dans auth.ts events.signIn — c'est dur à test
 * sans mocker tout NextAuth. On test ici la sémantique de parsing du
 * cookie + les bornes (slice(0,100) etc.) en reproduisant le snippet.
 *
 * Si la logique d'auth.ts diverge de ce test, c'est un signal que le
 * test doit être mis à jour (ou idéalement la logique extraite en helper).
 */

import { describe, it, expect } from 'vitest';
// Audit v3 L6 — on teste le VRAI helper (importé), plus une copie locale du
// snippet. Un refactor d'auth.ts qui casse l'opt-in Loi 25 rougit donc ici.
import { buildSignupUpdateData } from '@/lib/auth/pending-profile';

const parsePendingProfileCookie = buildSignupUpdateData;

describe('parsePendingProfileCookie (auth.ts signIn snippet)', () => {
  it('parse firstName + lastName → name composite', () => {
    const cookie = encodeURIComponent(JSON.stringify({
      firstName: 'Patrick',
      lastName: 'Thauvette',
    }));
    expect(parsePendingProfileCookie(cookie)).toEqual({
      firstName: 'Patrick',
      lastName: 'Thauvette',
      name: 'Patrick Thauvette',
    });
  });

  it('garde uniquement firstName si lastName missing', () => {
    const cookie = encodeURIComponent(JSON.stringify({ firstName: 'Solo' }));
    const out = parsePendingProfileCookie(cookie);
    expect(out.firstName).toBe('Solo');
    expect(out.lastName).toBeUndefined();
    expect(out.name).toBe('Solo');
  });

  it('emailMarketing=false → field omis (Loi 25 : défaut schéma false = opt-out)', () => {
    const cookie = encodeURIComponent(JSON.stringify({
      firstName: 'X',
      emailMarketing: false,
    }));
    // On n'écrit plus l'opt-out : le défaut schéma false s'en charge.
    expect(parsePendingProfileCookie(cookie).emailMarketing).toBeUndefined();
  });

  it('emailMarketing=true → field SET true (Loi 25 : opt-in affirmatif explicite)', () => {
    const cookie = encodeURIComponent(JSON.stringify({
      firstName: 'X',
      emailMarketing: true,
    }));
    expect(parsePendingProfileCookie(cookie).emailMarketing).toBe(true);
  });

  it('slice firstName/lastName à 100 chars (defense XSS / overflow)', () => {
    const big = 'a'.repeat(200);
    const cookie = encodeURIComponent(JSON.stringify({
      firstName: big, lastName: big,
    }));
    const out = parsePendingProfileCookie(cookie);
    expect(out.firstName?.length).toBe(100);
    expect(out.lastName?.length).toBe(100);
    expect(out.name?.length).toBeLessThanOrEqual(200);
  });

  it('returns {} si JSON invalide', () => {
    expect(parsePendingProfileCookie('not-json')).toEqual({});
  });

  it('returns {} si payload vide {}', () => {
    expect(parsePendingProfileCookie(encodeURIComponent('{}'))).toEqual({});
  });

  // finding [127] — companyName était capté par le formulaire de sign-up
  // mais jamais persisté (silencieusement perdu). Verrouille que le champ
  // est bien inclus dans le patch User, avec la même borne 100 chars.
  it('inclut companyName dans le patch User', () => {
    const cookie = encodeURIComponent(JSON.stringify({
      firstName: 'Patrick',
      companyName: 'Agence Boréal',
    }));
    expect(parsePendingProfileCookie(cookie).companyName).toBe('Agence Boréal');
  });

  it('slice companyName à 100 chars', () => {
    const big = 'a'.repeat(200);
    const cookie = encodeURIComponent(JSON.stringify({ companyName: big }));
    expect(parsePendingProfileCookie(cookie).companyName?.length).toBe(100);
  });

  it('companyName absent du payload → absent du patch', () => {
    const cookie = encodeURIComponent(JSON.stringify({ firstName: 'Solo' }));
    expect(parsePendingProfileCookie(cookie).companyName).toBeUndefined();
  });

  it('ignore les champs hors-spec', () => {
    const cookie = encodeURIComponent(JSON.stringify({
      firstName: 'P',
      role: 'ADMIN', // try to inject role
      email: 'attacker@evil.com',
    }));
    const out = parsePendingProfileCookie(cookie);
    expect(out).toEqual({ firstName: 'P', name: 'P' });
    expect(Object.keys(out)).not.toContain('role');
    expect(Object.keys(out)).not.toContain('email');
  });
});
