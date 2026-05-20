/**
 * Tests pour referrals/leaderboard — focus sur anonymizeEmail (pure).
 * getLeaderboard est testé indirectement via tests E2E.
 */

import { describe, it, expect } from 'vitest';
import { anonymizeEmail } from '@/lib/referrals/leaderboard';

describe('anonymizeEmail', () => {
  it('garde 2 premiers chars + domaine', () => {
    expect(anonymizeEmail('patrick@plio.ca')).toBe('pa***@plio.ca');
  });

  it('email court (3 chars) garde quand même 2', () => {
    expect(anonymizeEmail('jo@x.com')).toBe('jo***@x.com');
  });

  it('email d\'1 char garde 1', () => {
    expect(anonymizeEmail('x@example.com')).toBe('x***@example.com');
  });

  it('domain composé (foo.bar.com) préservé', () => {
    expect(anonymizeEmail('john@mail.democratik.org')).toBe('jo***@mail.democratik.org');
  });

  it('returns *** sur invalid (no @)', () => {
    expect(anonymizeEmail('not-an-email')).toBe('***');
  });

  it('returns *** sur empty local part', () => {
    expect(anonymizeEmail('@plio.ca')).toBe('***');
  });

  it('case-preserved (pas de lowercase forcé)', () => {
    expect(anonymizeEmail('Patrick@Plio.CA')).toBe('Pa***@Plio.CA');
  });
});
