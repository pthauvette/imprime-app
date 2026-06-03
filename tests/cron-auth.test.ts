/**
 * requireCronAuth — Audit v2 #7.8 (auth Bearer cron centralisée + constant-time).
 *
 * Verrouille : (1) secret absent + prod → 503 (refuse) ; (2) secret absent +
 * non-prod → null (autorise, best-effort dev) ; (3) bon Bearer → null ;
 * (4) mauvais / absent → 401. La comparaison constant-time est un détail
 * d'implémentation : on teste le RÉSULTAT (autorisé/refusé), pas le timing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { requireCronAuth } from '@/lib/cron/auth';

function reqWith(authHeader?: string): Request {
  return new Request('https://plio.ca/api/cron/test', {
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('requireCronAuth (#7.8)', () => {
  it('secret absent + production → 503 (refuse)', () => {
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('NODE_ENV', 'production');
    const res = requireCronAuth(reqWith('Bearer whatever'), 'test');
    expect(res?.status).toBe(503);
  });

  it('secret absent + non-prod → null (autorise en dev)', () => {
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('NODE_ENV', 'development');
    const res = requireCronAuth(reqWith(), 'test');
    expect(res).toBeNull();
  });

  it('bon Bearer → null (autorisé)', () => {
    vi.stubEnv('CRON_SECRET', 's3cret-token-abc');
    vi.stubEnv('NODE_ENV', 'production');
    const res = requireCronAuth(reqWith('Bearer s3cret-token-abc'), 'test');
    expect(res).toBeNull();
  });

  it('mauvais Bearer → 401', () => {
    vi.stubEnv('CRON_SECRET', 's3cret-token-abc');
    vi.stubEnv('NODE_ENV', 'production');
    const res = requireCronAuth(reqWith('Bearer wrong'), 'test');
    expect(res?.status).toBe(401);
  });

  it('header absent → 401', () => {
    vi.stubEnv('CRON_SECRET', 's3cret-token-abc');
    vi.stubEnv('NODE_ENV', 'production');
    const res = requireCronAuth(reqWith(), 'test');
    expect(res?.status).toBe(401);
  });

  it('même longueur mais contenu différent → 401 (pas de short-circuit exploitable)', () => {
    vi.stubEnv('CRON_SECRET', 'aaaaaaaa');
    vi.stubEnv('NODE_ENV', 'production');
    const res = requireCronAuth(reqWith('Bearer bbbbbbbb'), 'test');
    expect(res?.status).toBe(401);
  });
});
