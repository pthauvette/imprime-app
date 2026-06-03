/**
 * Tests pour GET /api/recovery/click — Round 27 #1.
 *
 * Lock-in :
 *   - Token HMAC déterministe + verify constant-time
 *   - Update set recoveryClickedAt seulement si NULL (idempotent re-clicks)
 *   - Fail-soft : token invalide / cart introuvable → redirect 302 quand même
 *   - Anti open-redirect : ?to doit être same-origin (commencer par / ou APP_URL)
 *   - Default fallback = home si ?to manquant
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    abandonedCart: { updateMany: vi.fn(async () => ({ count: 1 })) },
  },
}));

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: noop, error: noop, fatal: noop, debug: noop };
  return { log: stub };
});

import { prisma } from '@/lib/db';
import { recoveryClickToken, verifyRecoveryClickToken } from '@/lib/recovery/click-token';

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIG_ENV, AUTH_SECRET: 'fixed-test-secret', NEXT_PUBLIC_APP_URL: 'https://plio.ca' };
});

describe('recoveryClickToken / verifyRecoveryClickToken', () => {
  it('round-trip valide', () => {
    const t = recoveryClickToken('cart_1');
    expect(verifyRecoveryClickToken('cart_1', t)).toBe(true);
  });

  it('rejette token forgé pour autre cartId', () => {
    const t = recoveryClickToken('cart_1');
    expect(verifyRecoveryClickToken('cart_2', t)).toBe(false);
  });

  it('rejette token vide / mauvaise longueur', () => {
    expect(verifyRecoveryClickToken('cart_1', '')).toBe(false);
    expect(verifyRecoveryClickToken('cart_1', 'short')).toBe(false);
  });

  it('change si AUTH_SECRET change', () => {
    process.env.AUTH_SECRET = 'A';
    const a = recoveryClickToken('cart_1');
    process.env.AUTH_SECRET = 'B';
    const b = recoveryClickToken('cart_1');
    expect(a).not.toBe(b);
  });
});

describe('GET /api/recovery/click', () => {
  async function call(qs: string): Promise<Response> {
    const { GET } = await import('@/app/api/recovery/click/route');
    return GET(new Request(`http://localhost/api/recovery/click?${qs}`) as never);
  }

  it('302 redirect to home si cart manquant', async () => {
    const res = await call('');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://plio.ca/');
    expect(prisma.abandonedCart.updateMany).not.toHaveBeenCalled();
  });

  it('302 redirect to destination si token valide + set recoveryClickedAt', async () => {
    const token = recoveryClickToken('cart_1');
    const res = await call(`cart=cart_1&t=${token}&to=${encodeURIComponent('/order/review?productId=12')}`);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://plio.ca/order/review?productId=12');

    expect(prisma.abandonedCart.updateMany).toHaveBeenCalledOnce();
    const args = vi.mocked(prisma.abandonedCart.updateMany).mock.calls[0][0];
    expect(args.where).toMatchObject({ id: 'cart_1', recoveryClickedAt: null });
    expect((args.data as { recoveryClickedAt: Date }).recoveryClickedAt).toBeInstanceOf(Date);
  });

  it('idempotent : ne touche pas si recoveryClickedAt déjà set (where filter)', async () => {
    const token = recoveryClickToken('cart_1');
    await call(`cart=cart_1&t=${token}&to=/x`);
    const args = vi.mocked(prisma.abandonedCart.updateMany).mock.calls[0][0];
    // Le where IS NULL est dans le filtre — Prisma updateMany skipera si non-null
    expect(args.where).toMatchObject({ recoveryClickedAt: null });
  });

  it('fail-soft : token invalide → redirect 302 quand même, pas d\'update', async () => {
    const res = await call('cart=cart_1&t=invalid_token_abc&to=/somewhere');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://plio.ca/somewhere');
    expect(prisma.abandonedCart.updateMany).not.toHaveBeenCalled();
  });

  it('fail-soft : update throws → redirect 302 quand même', async () => {
    const token = recoveryClickToken('cart_x');
    vi.mocked(prisma.abandonedCart.updateMany).mockRejectedValueOnce(new Error('DB down'));
    const res = await call(`cart=cart_x&t=${token}&to=/order/review`);
    expect(res.status).toBe(302);
  });

  it('anti open-redirect : ?to=https://attacker.com ignoré → fallback home', async () => {
    const token = recoveryClickToken('cart_1');
    const res = await call(`cart=cart_1&t=${token}&to=${encodeURIComponent('https://attacker.com/phish')}`);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://plio.ca/');
  });

  // Audit v2 #6.1 — l'ancien `startsWith(APP_URL)` acceptait ces vecteurs.
  it('#6.1 — préfixe trompeur plio.ca.evil.com → fallback home', async () => {
    const token = recoveryClickToken('cart_1');
    const res = await call(`cart=cart_1&t=${token}&to=${encodeURIComponent('https://plio.ca.evil.com/phish')}`);
    expect(res.headers.get('location')).toBe('https://plio.ca/');
  });

  it('#6.1 — protocol-relative //evil.com → fallback home', async () => {
    const token = recoveryClickToken('cart_1');
    const res = await call(`cart=cart_1&t=${token}&to=${encodeURIComponent('//evil.com/phish')}`);
    expect(res.headers.get('location')).toBe('https://plio.ca/');
  });

  // Audit v2 #6.1 — durcissement : on n'accepte plus QUE les chemins internes
  // relatifs (le cron abandoned-cart ne génère que du relatif). Une URL absolue,
  // même same-origin, retombe désormais sur le fallback (safeInternalPath).
  it('#6.1 — URL absolue (même same-origin) → fallback home (relative-only)', async () => {
    const token = recoveryClickToken('cart_1');
    const res = await call(`cart=cart_1&t=${token}&to=${encodeURIComponent('https://plio.ca/account')}`);
    expect(res.headers.get('location')).toBe('https://plio.ca/');
  });
});
