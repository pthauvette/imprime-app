/**
 * Tests pour paymentRetryToken + verifyPaymentRetryToken — Round 25 #5.
 *
 * Le token doit être :
 *   - déterministe par orderId (même call = même token)
 *   - différent pour 2 orderIds différents
 *   - dépendant du AUTH_SECRET (rotate-protected)
 *   - vérifiable en constant-time (verify renvoie boolean clean)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { paymentRetryToken, verifyPaymentRetryToken } from '@/lib/payment/retry-token';

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIG_ENV, AUTH_SECRET: 'fixed-test-secret-min-32-characters-xx' };
});

describe('paymentRetryToken()', () => {
  it('déterministe pour le même orderId', () => {
    const t1 = paymentRetryToken('order_1');
    const t2 = paymentRetryToken('order_1');
    expect(t1).toBe(t2);
  });

  it('différent pour 2 orderIds distincts', () => {
    expect(paymentRetryToken('order_1')).not.toBe(paymentRetryToken('order_2'));
  });

  it('change si AUTH_SECRET change (rotate-protected)', () => {
    process.env.AUTH_SECRET = 'rotation-secret-A-min-32-characters-xx';
    const a = paymentRetryToken('order_1');
    process.env.AUTH_SECRET = 'rotation-secret-B-min-32-characters-xx';
    const b = paymentRetryToken('order_1');
    expect(a).not.toBe(b);
  });

  it('renvoie 32 chars hex', () => {
    const t = paymentRetryToken('any-order-id');
    expect(t).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('verifyPaymentRetryToken()', () => {
  it('accept le token valide', () => {
    const t = paymentRetryToken('order_1');
    expect(verifyPaymentRetryToken('order_1', t)).toBe(true);
  });

  it('rejette le token avec orderId différent', () => {
    const t = paymentRetryToken('order_1');
    expect(verifyPaymentRetryToken('order_2', t)).toBe(false);
  });

  it('rejette token vide', () => {
    expect(verifyPaymentRetryToken('order_1', '')).toBe(false);
  });

  it('rejette token de mauvaise longueur (anti-brute-force)', () => {
    expect(verifyPaymentRetryToken('order_1', 'short')).toBe(false);
    expect(verifyPaymentRetryToken('order_1', 'a'.repeat(64))).toBe(false);
  });

  it('rejette token forgé même si même longueur (HMAC bypass attempt)', () => {
    const t = paymentRetryToken('order_1');
    // Flip un char au milieu
    const tampered = t.slice(0, 16) + (t[16] === '0' ? '1' : '0') + t.slice(17);
    expect(verifyPaymentRetryToken('order_1', tampered)).toBe(false);
  });
});
