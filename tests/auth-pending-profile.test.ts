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

// Reproduit la logique de parsing telle qu'elle vit dans
// src/auth.ts events.signIn (lignes ~130-160 au moment d'écrire).
// Test-driven : si on doit changer le shape, on change ici d'abord.
interface PendingProfilePayload {
  firstName?: string;
  lastName?: string;
  companyName?: string;
  emailMarketing?: boolean;
}

interface UserUpdateData {
  firstName?: string;
  lastName?: string;
  name?: string;
  emailMarketing?: boolean;
}

function parsePendingProfileCookie(cookieValue: string): UserUpdateData {
  let pending: PendingProfilePayload;
  try {
    pending = JSON.parse(decodeURIComponent(cookieValue)) as PendingProfilePayload;
  } catch {
    return {};
  }
  const updateData: UserUpdateData = {};
  if (pending.firstName) updateData.firstName = pending.firstName.slice(0, 100);
  if (pending.lastName) updateData.lastName = pending.lastName.slice(0, 100);
  if (pending.firstName || pending.lastName) {
    updateData.name = [pending.firstName, pending.lastName]
      .filter(Boolean).join(' ').slice(0, 200);
  }
  if (pending.emailMarketing === false) updateData.emailMarketing = false;
  return updateData;
}

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

  it('emailMarketing=false → opt-out marqué', () => {
    const cookie = encodeURIComponent(JSON.stringify({
      firstName: 'X',
      emailMarketing: false,
    }));
    expect(parsePendingProfileCookie(cookie).emailMarketing).toBe(false);
  });

  it('emailMarketing=true → field omis (default reste true)', () => {
    const cookie = encodeURIComponent(JSON.stringify({
      firstName: 'X',
      emailMarketing: true,
    }));
    expect(parsePendingProfileCookie(cookie).emailMarketing).toBeUndefined();
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
