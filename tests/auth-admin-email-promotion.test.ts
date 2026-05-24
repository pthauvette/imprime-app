/**
 * Tests pour la logique isAdminEmail() vivant dans src/auth.ts — Round 36 #4.
 *
 * Pourquoi reproduire la logique : tester directement src/auth.ts demande
 * de mocker tout NextAuth + PrismaAdapter + cookies(), ce qui est plus
 * fragile que la logique elle-même. On reproduit la sémantique exacte
 * pour pin-down le comportement.
 *
 * Si la logique de src/auth.ts:28-37 diverge de ces tests, soit on la
 * met à jour, soit on doit extraire `isAdminEmail` en helper exporté.
 *
 * Risk : audit Round 35+1 a flag que tout le auth flow magic-link n'avait
 * pas de tests. Les tokens magic-link eux-mêmes sont gérés par Auth.js
 * core (PrismaAdapter VerificationToken) — pas notre code à tester. Mais
 * la promotion ADMIN via env var EST notre code, et un bug ici = privilege
 * escalation potentiel.
 */

import { describe, it, expect } from 'vitest';

/**
 * Reproduction littérale de src/auth.ts:28-37 :
 * - Parse ADMIN_EMAILS env (comma-separated)
 * - Trim chaque entrée
 * - Lowercase
 * - Filter empty strings
 * - Match input.toLowerCase() in the Set
 */
function buildAdminEmailMatcher(envValue: string | undefined): (email: string | null | undefined) => boolean {
  const ADMIN_EMAILS = new Set(
    (envValue ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
  return (email: string | null | undefined): boolean => {
    return !!email && ADMIN_EMAILS.has(email.toLowerCase());
  };
}

describe('isAdminEmail (src/auth.ts logic)', () => {
  it('env vide → personne admin', () => {
    const match = buildAdminEmailMatcher('');
    expect(match('admin@plio.ca')).toBe(false);
    expect(match('anyone@anywhere.ca')).toBe(false);
  });

  it('env undefined → personne admin', () => {
    const match = buildAdminEmailMatcher(undefined);
    expect(match('admin@plio.ca')).toBe(false);
  });

  it('1 email → match exact', () => {
    const match = buildAdminEmailMatcher('admin@plio.ca');
    expect(match('admin@plio.ca')).toBe(true);
    expect(match('other@plio.ca')).toBe(false);
  });

  it('multiple emails comma-separated avec spaces', () => {
    const match = buildAdminEmailMatcher('admin@plio.ca, ops@plio.ca, dev@plio.ca');
    expect(match('admin@plio.ca')).toBe(true);
    expect(match('ops@plio.ca')).toBe(true);
    expect(match('dev@plio.ca')).toBe(true);
    expect(match('hacker@plio.ca')).toBe(false);
  });

  it('case-insensitive match (user tape MIXED case)', () => {
    const match = buildAdminEmailMatcher('admin@plio.ca');
    expect(match('Admin@plio.ca')).toBe(true);
    expect(match('ADMIN@PLIO.CA')).toBe(true);
    expect(match('Admin@Plio.CA')).toBe(true);
  });

  it('case-insensitive store (env tape MIXED case)', () => {
    const match = buildAdminEmailMatcher('Admin@Plio.CA');
    expect(match('admin@plio.ca')).toBe(true);
  });

  it('null / undefined email → false (jamais admin par défaut)', () => {
    const match = buildAdminEmailMatcher('admin@plio.ca');
    expect(match(null)).toBe(false);
    expect(match(undefined)).toBe(false);
    expect(match('')).toBe(false);
  });

  it('trim whitespace dans env entries (config sloppy)', () => {
    const match = buildAdminEmailMatcher('  admin@plio.ca  ,   ops@plio.ca   ');
    expect(match('admin@plio.ca')).toBe(true);
    expect(match('ops@plio.ca')).toBe(true);
  });

  it('empty entries dans env (double comma, trailing comma) → ignored', () => {
    const match = buildAdminEmailMatcher('admin@plio.ca,,ops@plio.ca,');
    expect(match('admin@plio.ca')).toBe(true);
    expect(match('ops@plio.ca')).toBe(true);
    // Empty string ne devient PAS admin (filter(Boolean) le retire)
    expect(match('')).toBe(false);
  });

  it('substring not match (admin@plio.ca ≠ admin@plio.ca.evil.com)', () => {
    const match = buildAdminEmailMatcher('admin@plio.ca');
    expect(match('admin@plio.ca.evil.com')).toBe(false);
    expect(match('foo.admin@plio.ca')).toBe(false);
  });

  it('email avec + plus addressing → match strict', () => {
    const match = buildAdminEmailMatcher('admin@plio.ca');
    // Plio ne supporte PAS le plus-addressing comme alias admin
    expect(match('admin+test@plio.ca')).toBe(false);
  });
});

/**
 * Tests pour le pattern "isNewUser → first-sign-in heuristique" qui vit
 * dans src/auth.ts:177-... events.signIn. Reproduit la logique fallback :
 *   - Si isNewUser true → first sign-in confirmed
 *   - Sinon, fallback heuristique : 0 orders + 0 designs + createdAt récent
 */
function isFirstSignIn(
  isNewUser: boolean | undefined,
  counts: { _count: { orders: number; designs: number } } | null,
  createdAt: Date,
  recentThresholdMs = 5 * 60 * 1000,
): boolean {
  if (isNewUser === true) return true;
  if (!counts) return false;
  if (counts._count.orders > 0 || counts._count.designs > 0) return false;
  return Date.now() - createdAt.getTime() < recentThresholdMs;
}

describe('isFirstSignIn fallback heuristique', () => {
  it('isNewUser=true → true immédiatement', () => {
    expect(isFirstSignIn(true, null, new Date(0))).toBe(true);
  });

  it('isNewUser=false + 0 orders + 0 designs + createdAt récent → true', () => {
    const now = new Date(Date.now() - 60 * 1000); // 1 min ago
    expect(isFirstSignIn(false, { _count: { orders: 0, designs: 0 } }, now)).toBe(true);
  });

  it('isNewUser=false + 1 order → false (returning user)', () => {
    const now = new Date(Date.now() - 60 * 1000);
    expect(isFirstSignIn(false, { _count: { orders: 1, designs: 0 } }, now)).toBe(false);
  });

  it('isNewUser=false + 1 design draft → false', () => {
    const now = new Date(Date.now() - 60 * 1000);
    expect(isFirstSignIn(false, { _count: { orders: 0, designs: 1 } }, now)).toBe(false);
  });

  it('isNewUser=false + createdAt ancien (1 jour) → false (returning user qui se re-connecte)', () => {
    const oldDate = new Date(Date.now() - 24 * 3600 * 1000);
    expect(isFirstSignIn(false, { _count: { orders: 0, designs: 0 } }, oldDate)).toBe(false);
  });

  it('counts null (user introuvable) → false (defensive)', () => {
    expect(isFirstSignIn(false, null, new Date())).toBe(false);
  });
});
